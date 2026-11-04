import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db.mjs";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

export async function activePlaceholders(offerIds) {
  if (!offerIds.length) return [];
  const result = await getDb().query(
    `SELECT id,offer_id AS "offerId",name,quantity,created_at AS "createdAt"
     FROM placeholder_reservations WHERE offer_id=ANY($1::text[]) AND status='active'
     ORDER BY created_at,id`,
    [offerIds],
  );
  return result.rows;
}

export async function placeholderKitchen(id) {
  const row = (await getDb().query(
    "SELECT kitchen_id AS kitchenId FROM placeholder_reservations WHERE id=$1",
    [id],
  )).rows[0];
  if (!row) fail("Persona provisional no encontrada.", 404);
  return row.kitchenId;
}

export async function addPlaceholder(kitchenId, actorId, data) {
  const offerId = typeof data?.offerId === "string" ? data.offerId : "";
  const name = typeof data?.name === "string" ? data.name.trim().replace(/\s+/g, " ") : "";
  const quantity = Number(data?.quantity);
  if (name.length < 2 || name.length > 80 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10)
    fail("Indica un nombre y entre 1 y 10 porciones.");
  return transaction(async (db) => {
    const offer = (await db.query(
      `SELECT o.id,o.booking_deadline_at AS "bookingDeadline",d.name AS "dishName",d.image_url AS "imageUrl",
       COALESCE(o.price_override_cents,d.price_cents) AS "priceCents"
       FROM offers o JOIN dishes d ON d.kitchen_id=o.kitchen_id AND d.id=o.dish_id
       WHERE o.id=$1 AND o.kitchen_id=$2`,
      [offerId, kitchenId],
    )).rows[0];
    if (!offer) fail("Menú no encontrado.", 404);
    const now = new Date().toISOString();
    const stock = await db.query(
      `UPDATE offers SET reserved_count=reserved_count+$3,
       sold_out_at=CASE WHEN reserved_count+$3=capacity THEN $4 ELSE sold_out_at END
       WHERE id=$1 AND kitchen_id=$2 AND reserved_count+$3<=capacity RETURNING id`,
      [offerId, kitchenId, quantity, now],
    );
    if (!stock.rowCount) fail("No quedan suficientes porciones.", 409);
    const id = randomUUID();
    await db.query(
      `INSERT INTO placeholder_reservations(id,offer_id,kitchen_id,name,quantity,dish_name,image_url,unit_price_cents,booking_deadline_at,created_by,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, offerId, kitchenId, name, quantity, offer.dishName, offer.imageUrl, offer.priceCents, offer.bookingDeadline, actorId, now],
    );
    return { id };
  });
}

export async function removePlaceholder(kitchenId, actorId, data) {
  const id = typeof data?.placeholderId === "string" ? data.placeholderId : "";
  return transaction(async (db) => {
    const row = (await db.query(
      `SELECT id,offer_id AS "offerId",quantity,status FROM placeholder_reservations
       WHERE id=$1 AND kitchen_id=$2`,
      [id, kitchenId],
    )).rows[0];
    if (!row) fail("Persona provisional no encontrada.", 404);
    if (row.status !== "active") fail("Esta persona provisional ya fue vinculada o anulada.", 409);
    const released = await db.query(
      "UPDATE offers SET reserved_count=reserved_count-$2,sold_out_at=NULL WHERE id=$1 AND kitchen_id=$3 AND reserved_count>=$2 RETURNING id",
      [row.offerId, row.quantity, kitchenId],
    );
    if (!released.rowCount) fail("No se pudo liberar el cupo.", 409);
    await db.query(
      "UPDATE placeholder_reservations SET status='cancelled',cancelled_by=$2,cancelled_at=$3 WHERE id=$1",
      [id, actorId, new Date().toISOString()],
    );
    return { ok: true };
  });
}

export async function linkPlaceholder(kitchenId, actorId, data) {
  const id = typeof data?.placeholderId === "string" ? data.placeholderId : "";
  const studentId = typeof data?.studentId === "string" ? data.studentId : "";
  return transaction(async (db) => {
    const row = (await db.query(
      `SELECT p.id,p.offer_id AS "offerId",p.quantity,p.status,p.created_at AS "createdAt",
       p.dish_name AS "dishName",p.image_url AS "imageUrl",p.unit_price_cents AS "priceCents",p.booking_deadline_at AS "bookingDeadline",
       o.offer_date AS date,o.delivery_time AS "deliveryTime",COALESCE(o.pickup_until_extended,o.pickup_until) AS "pickupUntil",
       k.name AS "kitchenName"
       FROM placeholder_reservations p JOIN offers o ON o.id=p.offer_id
       JOIN kitchens k ON k.id=o.kitchen_id
       WHERE p.id=$1 AND p.kitchen_id=$2`,
      [id, kitchenId],
    )).rows[0];
    if (!row) fail("Persona provisional no encontrada.", 404);
    if (row.status !== "active") fail("Esta persona provisional ya fue vinculada o anulada.", 409);
    const student = (await db.query("SELECT id FROM users WHERE id=$1 AND role='consumer'", [studentId])).rows[0];
    if (!student) fail("Estudiante no encontrado.", 404);
    if ((await db.query(
      `SELECT 1 FROM orders r JOIN order_items i ON i.order_id=r.id
       WHERE r.user_id=$1 AND i.offer_id=$2 AND r.status='reservado' AND r.fulfillment_status<>'no_show' LIMIT 1`,
      [studentId, row.offerId],
    )).rowCount) fail("Este estudiante ya tiene una reserva en este menú.", 409);
    if ((await db.query(
      "SELECT 1 FROM orders WHERE user_id=$1 AND status='reservado' AND fulfillment_status='no_show' LIMIT 1",
      [studentId],
    )).rowCount) fail("Este estudiante tiene una ausencia pendiente de revisión.", 409);

    const orderId = randomUUID();
    const total = row.priceCents * row.quantity;
    await db.query(
      `INSERT INTO orders(id,code,user_id,kitchen_id,kitchen_name,offer_date,delivery_time,pickup_until,pickup_point,status,payment,total_cents,fulfillment_status,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reservado','QR al recibir',$10,'pending',$11)`,
      [orderId, `MU-${randomUUID().slice(0, 8).toUpperCase()}`, studentId, kitchenId, row.kitchenName,
        row.date, row.deliveryTime, row.pickupUntil, "Entrada del Comedor UTEC en piso 2", total, row.createdAt],
    );
    await db.query(
      `INSERT INTO order_items(order_id,offer_id,dish_name,image_url,quantity,unit_price_cents,total_cents,booking_deadline_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [orderId, row.offerId, row.dishName, row.imageUrl, row.quantity, row.priceCents, total, row.bookingDeadline],
    );
    await db.query(
      "UPDATE placeholder_reservations SET status='linked',linked_user_id=$2,linked_order_id=$3,linked_by=$4,linked_at=$5 WHERE id=$1",
      [id, studentId, orderId, actorId, new Date().toISOString()],
    );
    await db.query(
      "INSERT INTO kitchen_reservation_events(id,order_id,actor_user_id,action,detail) VALUES($1,$2,$3,'manual_add',$4)",
      [randomUUID(), orderId, actorId, `Vinculado desde persona provisional ${id}; ${row.quantity} porción(es) ya apartada(s)`],
    );
    return { orderId };
  });
}
