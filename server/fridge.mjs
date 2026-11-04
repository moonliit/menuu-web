import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db.mjs";

export const fridgePhone = "+51 934 695 273";
const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

function nextLimaMidnight(date) {
  const limaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  return new Date(Date.parse(`${limaDate}T05:00:00Z`) + 86_400_000).toISOString();
}

export async function clearExpiredFridgePhotos(now = new Date()) {
  const expired = await getDb().query(
    "SELECT 1 FROM orders WHERE fridge_image IS NOT NULL AND fridge_image_expires_at <= $1 LIMIT 1",
    [now.toISOString()],
  );
  if (!expired.rowCount) return { removed: 0 };
  const result = await getDb().query(
    `UPDATE orders SET fridge_image=NULL,fridge_image_mime=NULL
     WHERE fridge_image IS NOT NULL AND fridge_image_expires_at <= $1`,
    [now.toISOString()],
  );
  return { removed: result.rowCount };
}

export async function leaveOrderInFridge(kitchenId, actorId, orderId, phone, bytes, mime, now = new Date()) {
  if (!orderId || phone !== fridgePhone) fail("Selecciona el número de contacto indicado.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(mime))
    fail("Sube una foto PNG, JPG o WebP.");
  if (!bytes?.length || bytes.length > 2_000_000)
    fail("La foto debe pesar como máximo 2 MB.");

  return transaction(async (db) => {
    const order = (await db.query(
      `SELECT o.status,o.fulfillment_status AS "fulfillmentStatus",o.offer_date AS date,
       o.delivery_time AS "deliveryTime",o.payment_checkout_id AS "paymentCheckoutId",
       p.status AS "paymentStatus"
       FROM orders o LEFT JOIN payment_checkouts p ON p.id=o.payment_checkout_id
       WHERE o.id=$1 AND o.kitchen_id=$2`,
      [orderId, kitchenId],
    )).rows[0];
    if (!order) fail("Reserva no encontrada.", 404);
    if (!order.paymentCheckoutId || order.paymentStatus !== "approved")
      fail("Solo una reserva previa con Yape aprobado puede dejarse en refri.", 409);
    if (order.status !== "reservado" || order.fulfillmentStatus !== "pending")
      fail("Esta reserva ya no está pendiente de entrega.", 409);
    if (now.getTime() < new Date(`${order.date}T${order.deliveryTime}:00-05:00`).getTime())
      fail("Espera a que pase la hora de inicio del recojo.", 409);

    const expiresAt = nextLimaMidnight(new Date(`${order.date}T12:00:00Z`));
    if (now.toISOString() >= expiresAt)
      fail("El día de recojo ya terminó. No se puede subir una foto que debe eliminarse hoy.", 409);
    await db.query(
      `UPDATE orders SET fridge_at=$3,fridge_phone=$4,fridge_image_mime=$5,
       fridge_image=$6,fridge_image_expires_at=$7,review_enabled=0
       WHERE id=$1 AND kitchen_id=$2`,
      [orderId, kitchenId, now.toISOString(), phone, mime, bytes, expiresAt],
    );
    await db.query(
      "INSERT INTO kitchen_reservation_events(id,order_id,actor_user_id,action,detail) VALUES($1,$2,$3,'fridge',$4)",
      [randomUUID(), orderId, actorId, `Dejado en refri; contacto ${phone}`],
    );
    return { ok: true };
  });
}

export async function fridgePhoto(orderId, user, now = new Date()) {
  const order = (await getDb().query(
    `SELECT o.user_id AS "userId",o.kitchen_id AS "kitchenId",o.fridge_image_mime AS mime,
     o.fridge_image AS content,o.fridge_image_expires_at AS "expiresAt"
     FROM orders o WHERE o.id=$1`,
    [orderId],
  )).rows[0];
  if (!order || !user || (user.role !== "admin" && order.userId !== user.id && !(user.role === "kitchen" && order.kitchenId === user.kitchenId)))
    fail("Foto no encontrada.", 404);
  if (!order.content || !order.expiresAt || order.expiresAt <= now.toISOString())
    fail("La foto ya no está disponible.", 404);
  return { mime: order.mime, content: Buffer.from(order.content) };
}

export async function fridgeNotices(userId, now = new Date()) {
  const result = await getDb().query(
    `SELECT id,code,kitchen_name AS "kitchenName",offer_date AS date,
     fridge_phone AS phone,fridge_image_expires_at AS "expiresAt",
     CASE WHEN fridge_image IS NOT NULL AND fridge_image_expires_at > $2 THEN 1 ELSE 0 END AS "photoAvailable"
     FROM orders WHERE user_id=$1 AND status='reservado' AND fulfillment_status='pending'
       AND fridge_at IS NOT NULL ORDER BY fridge_at DESC`,
    [userId, now.toISOString()],
  );
  return result.rows.map((row) => ({
    orderId: row.id,
    code: row.code,
    kitchenName: row.kitchenName,
    date: row.date,
    phone: row.phone,
    photoUrl: row.photoAvailable ? `/api/orders/${row.id}/fridge-photo` : null,
  }));
}
