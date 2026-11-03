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

export async function submitPaymentProof(userId, checkoutId, bytes, mime) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 2_000_000)
    fail("Sube una imagen de hasta 2 MB.", 413);
  const validPng = mime === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const validJpeg = mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  if (!validPng && !validJpeg) fail("El comprobante debe ser PNG o JPG.");
  return transaction(async (db) => {
    const checkout = (await db.query(
      "SELECT id,status,expires_at AS \"expiresAt\" FROM payment_checkouts WHERE id=$1 AND user_id=$2",
      [checkoutId, userId],
    )).rows[0];
    if (!checkout) fail("Pago no encontrado.", 404);
    if (checkout.status !== "awaiting_proof") fail("Este pago ya no admite comprobantes.", 409);
    if (checkout.expiresAt <= new Date().toISOString()) fail("El plazo para subir el comprobante terminó.", 409);
    await db.query(
      "UPDATE payment_checkouts SET status='under_review',proof_mime=$2,proof_content=$3,proof_uploaded_at=$4 WHERE id=$1",
      [checkoutId, mime, bytes, new Date().toISOString()],
    );
    return { ok: true };
  });
}

export async function paymentProof(checkoutId, user) {
  const checkout = (await getDb().query(
    "SELECT user_id AS \"userId\",proof_mime AS mime,proof_content AS content FROM payment_checkouts WHERE id=$1",
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
  return result.rows;
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
    for (const order of orders.rows) await db.query(
      "INSERT INTO kitchen_reservation_events(id,order_id,actor_user_id,action,detail) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), order.id, actorId, decision === "approved" ? "prepayment_approved" : "prepayment_rejected", cleanedNote],
    );
    return { ok: true };
  });
}
