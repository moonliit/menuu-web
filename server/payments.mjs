import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db.mjs";
import { releaseOrderCapacity } from "./reservation-lifecycle.mjs";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

export async function expireUnpaidCheckouts() {
  await transaction(async (db) => {
    const expired = await db.query(
      "SELECT id FROM payment_checkouts WHERE status='awaiting_proof' AND expires_at <= $1",
      [new Date().toISOString()],
    );
    for (const checkout of expired.rows) {
      const orders = await db.query(
        "SELECT id,kitchen_id AS \"kitchenId\" FROM orders WHERE payment_checkout_id=$1 AND status='reservado'",
        [checkout.id],
      );
      for (const order of orders.rows) {
        await db.query("UPDATE orders SET status='cancelado',cancelled_at=$2 WHERE id=$1", [order.id, new Date().toISOString()]);
        await releaseOrderCapacity(db, order.id, order.kitchenId);
      }
      await db.query("UPDATE payment_checkouts SET status='expired' WHERE id=$1", [checkout.id]);
    }
  });
}

export async function submitPaymentProof(userId, checkoutId, bytes, declaredMime) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 3_000_000)
    fail("Sube una imagen de hasta 3 MB.", 413);
  const mime = declaredMime === "image/jpg" || declaredMime === "image/pjpeg" ? "image/jpeg" : declaredMime;
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime))
    fail("El comprobante debe ser PNG, JPG, JPEG, WebP o GIF.");
  return transaction(async (db) => {
    const checkout = (await db.query(
      "SELECT id,status,expires_at AS \"expiresAt\" FROM payment_checkouts WHERE id=$1 AND user_id=$2",
      [checkoutId, userId],
    )).rows[0];
    if (!checkout) fail("Pago no encontrado.", 404);
    if (checkout.status !== "awaiting_proof") fail("Este pago ya no admite comprobantes.", 409);
    if (checkout.expiresAt <= new Date().toISOString()) fail("El plazo para subir el comprobante terminó.", 409);
    await db.query(
      "UPDATE payment_checkouts SET status='under_review',proof_mime=$2,proof_declared_mime=$3,proof_content=$4,proof_uploaded_at=$5 WHERE id=$1",
      [checkoutId, ["image/png", "image/jpeg"].includes(mime) ? mime : null, mime, bytes, new Date().toISOString()],
    );
    return { ok: true };
  });
}

export async function paymentProof(checkoutId, user) {
  const checkout = (await getDb().query(
    "SELECT user_id AS \"userId\",COALESCE(proof_declared_mime,proof_mime) AS mime,proof_content AS content FROM payment_checkouts WHERE id=$1",
    [checkoutId],
  )).rows[0];
  if (!checkout || !checkout.content || (user.role !== "admin" && user.id !== checkout.userId))
    fail("Comprobante no encontrado.", 404);
  return { mime: checkout.mime, content: Buffer.from(checkout.content) };
}

export async function pendingPayments() {
  const result = await getDb().query(
    `SELECT p.id,p.amount_cents AS "amountCents",p.status,p.created_at AS "createdAt",
      p.proof_uploaded_at AS "proofUploadedAt",u.name AS "studentName",u.email AS "studentEmail",
      GROUP_CONCAT(o.code, ', ') AS codes,COUNT(o.id) AS "orderCount"
     FROM payment_checkouts p JOIN users u ON u.id=p.user_id
     JOIN orders o ON o.payment_checkout_id=p.id
     WHERE p.status='under_review'
     GROUP BY p.id ORDER BY p.proof_uploaded_at ASC`,
  );
  if (!result.rows.length) return [];
  const checkoutIds = result.rows.map((row) => row.id);
  const ordersResult = await getDb().query(
    `SELECT o.id,o.payment_checkout_id AS "checkoutId",o.code,o.kitchen_name AS "kitchenName",
      o.offer_date AS date,o.delivery_time AS "deliveryTime",o.pickup_until AS "pickupUntil",
      o.total_cents AS "totalCents"
     FROM orders o WHERE o.payment_checkout_id=ANY($1::text[])
     ORDER BY o.created_at,o.id`,
    [checkoutIds],
  );
  const orderIds = ordersResult.rows.map((row) => row.id);
  const [itemsResult, choicesResult] = await Promise.all([
    getDb().query(
      `SELECT i.id,i.order_id AS "orderId",i.dish_name AS name,i.image_url AS "imageUrl",
        i.quantity,i.comment,i.unit_price_cents AS "unitPriceCents",i.total_cents AS "totalCents"
       FROM order_items i WHERE i.order_id=ANY($1::text[])
       ORDER BY i.sort_order,i.id`,
      [orderIds],
    ),
    getDb().query(
      `SELECT c.order_item_id AS "itemId",c.group_title AS title,c.choice_label AS label
       FROM order_item_choices c JOIN order_items i ON i.id=c.order_item_id
       WHERE i.order_id=ANY($1::text[]) ORDER BY c.sort_order,c.choice_id`,
      [orderIds],
    ),
  ]);
  const ordersByCheckout = new Map(checkoutIds.map((id) => [id, []]));
  const ordersById = new Map();
  for (const row of ordersResult.rows) {
    const order = { ...row, items: [] };
    ordersByCheckout.get(row.checkoutId).push(order);
    ordersById.set(row.id, order);
  }
  const itemsById = new Map();
  for (const row of itemsResult.rows) {
    const item = { ...row, choices: [] };
    ordersById.get(row.orderId)?.items.push(item);
    itemsById.set(row.id, item);
  }
  for (const choice of choicesResult.rows) itemsById.get(choice.itemId)?.choices.push(choice);
  return result.rows.map((row) => ({ ...row, orders: ordersByCheckout.get(row.id) }));
}

export async function reviewPayment(checkoutId, actorId, decision, note = "") {
  if (!['approved','rejected'].includes(decision)) fail("Decisión inválida.");
  const cleanedNote = typeof note === "string" ? note.trim().slice(0, 300) : "";
  if (decision === "rejected" && !cleanedNote) fail("Indica por qué se rechazó el pago.");
  return transaction(async (db) => {
    const checkout = (await db.query(
      "SELECT id,status FROM payment_checkouts WHERE id=$1",
      [checkoutId],
    )).rows[0];
    if (!checkout) fail("Pago no encontrado.", 404);
    if (checkout.status !== "under_review") fail("Este pago ya fue revisado.", 409);
    const orders = await db.query(
      "SELECT id,kitchen_id AS \"kitchenId\" FROM orders WHERE payment_checkout_id=$1 AND status='reservado'",
      [checkoutId],
    );
    if (!orders.rowCount) fail("No hay reservas activas para este pago.", 409);
    if (decision === "rejected") {
      for (const order of orders.rows) {
        await db.query("UPDATE orders SET status='cancelado',cancelled_at=$2 WHERE id=$1", [order.id, new Date().toISOString()]);
        await releaseOrderCapacity(db, order.id, order.kitchenId);
      }
    } else {
      await db.query("UPDATE orders SET payment_recorded='QR' WHERE payment_checkout_id=$1", [checkoutId]);
    }
    await db.query(
      "UPDATE payment_checkouts SET status=$2,reviewed_by=$3,reviewed_at=$4,review_note=$5 WHERE id=$1",
      [checkoutId, decision, actorId, new Date().toISOString(), cleanedNote],
    );
    if (decision === "approved") await db.query(
      "UPDATE payment_checkouts SET proof_content=NULL,proof_mime=NULL,proof_declared_mime=NULL WHERE id=$1",
      [checkoutId],
    );
    for (const order of orders.rows) await db.query(
      "INSERT INTO kitchen_reservation_events(id,order_id,actor_user_id,action,detail) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), order.id, actorId, decision === "approved" ? "prepayment_approved" : "prepayment_rejected", cleanedNote],
    );
    return { ok: true };
  });
}
