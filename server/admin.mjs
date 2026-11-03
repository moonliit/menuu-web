import { randomUUID } from "node:crypto";
import { weekStart } from "./catalog.mjs";
import { getDb, transaction } from "./db.mjs";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

export async function adminData({
  week = null,
  kitchen = "all",
  limit = 20,
  offset = 0,
} = {}) {
  const start = weekStart();
  const from =
    week === null
      ? start
      : new Date(Date.parse(`${start}T12:00:00Z`) + week * 7 * 86400_000)
          .toISOString()
          .slice(0, 10);
  const days = week === null ? 14 : 7;
  const filter = `o.offer_date >= $1 AND o.offer_date < date($1, '+${days} days') AND ($2='all' OR o.kitchen_id=$2)`;
  const [offers, count, kitchens] = await Promise.all([
    getDb().query(
      `SELECT o.id,o.kitchen_id AS "kitchenId",k.name AS "kitchenName",k.logo_url AS "kitchenLogoUrl",
       o.dish_id AS "dishId",d.name AS "dishName",d.image_url AS "imageUrl",d.image_alt AS "imageAlt",
       o.offer_date AS date,o.delivery_time AS "deliveryTime",o.pickup_until AS "pickupUntil",
       o.booking_deadline_at AS "bookingDeadline",o.capacity,o.reserved_count AS "reservedCount",
       o.published_at AS "publishedAt"
       FROM offers o JOIN kitchens k ON k.id=o.kitchen_id
       JOIN dishes d ON d.kitchen_id=o.kitchen_id AND d.id=o.dish_id
       WHERE ${filter}
       ORDER BY o.offer_date,o.delivery_time,k.name,d.name,o.id LIMIT $3 OFFSET $4`,
      [from, kitchen, limit, offset],
    ),
    getDb().query(`SELECT count(*) AS total FROM offers o WHERE ${filter}`, [
      from,
      kitchen,
    ]),
    getDb().query(
      `SELECT DISTINCT k.id,k.name FROM kitchens k JOIN offers o ON o.kitchen_id=k.id
       WHERE o.offer_date >= $1 AND o.offer_date < date($1, '+14 days') ORDER BY k.name`,
      [start],
    ),
  ]);
  const offerIds = offers.rows.map((offer) => offer.id);
  const reservations = offerIds.length
    ? await getDb().query(
        `SELECT i.offer_id AS "offerId",i.id AS "orderItemId",r.id AS "orderId",r.code,
       u.name AS "studentName",u.email AS "studentEmail",i.quantity,
       i.delivered_quantity AS "deliveredQuantity",i.booking_deadline_at AS "bookingDeadlineAt",
       r.status,r.fulfillment_status AS "fulfillmentStatus",r.payment_recorded AS "paymentRecorded",r.delivered_at AS "deliveredAt",
       r.created_at AS "createdAt",
       EXISTS(SELECT 1 FROM kitchen_reservation_events e WHERE e.order_id=r.id AND e.action='manual_add') AS "manualAdded"
       FROM orders r JOIN order_items i ON i.order_id=r.id
       JOIN users u ON u.id=r.user_id JOIN offers o ON o.id=i.offer_id
       WHERE i.offer_id=ANY($1::text[])
       ORDER BY o.offer_date,o.delivery_time,u.name,r.created_at`,
        [offerIds],
      )
    : { rows: [] };

  return {
    offers: offers.rows,
    reservations: reservations.rows,
    weekStart: start,
    kitchens: kitchens.rows,
    totalOffers: Number(count.rows[0].total),
    limit,
    offset,
  };
}

export async function adminOfferKitchen(offerId) {
  const start = weekStart();
  const result = await getDb().query(
    `SELECT kitchen_id AS "kitchenId" FROM offers
     WHERE id=$1 AND offer_date >= $2 AND offer_date < date($2, '+14 days')`,
    [offerId, start],
  );

  if (!result.rowCount) fail("Menú no encontrado en estas dos semanas.", 404);

  return result.rows[0].kitchenId;
}

export async function adminOrderKitchen(orderId) {
  const start = weekStart();
  const result = await getDb().query(
    `SELECT r.kitchen_id AS "kitchenId" FROM orders r
     JOIN order_items i ON i.order_id=r.id JOIN offers o ON o.id=i.offer_id
     WHERE r.id=$1 AND o.offer_date >= $2 AND o.offer_date < date($2, '+14 days')
     LIMIT 1`,
    [orderId, start],
  );

  if (!result.rowCount) fail("Pedido no encontrado en estas dos semanas.", 404);

  return result.rows[0].kitchenId;
}

export async function updateAdminCapacity(actorId, data) {
  const offerId = typeof data?.offerId === "string" ? data.offerId : "";
  const capacity = Number(data?.capacity);

  if (
    !offerId ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 10000
  )
    fail("Indica un cupo válido entre 1 y 10000.");
  const start = weekStart();

  return transaction(async (db) => {
    const offer = (
      await db.query(
        `SELECT capacity,reserved_count AS "reservedCount" FROM offers
         WHERE id=$1 AND offer_date >= $2 AND offer_date < date($2, '+14 days')`,
        [offerId, start],
      )
    ).rows[0];

    if (!offer) fail("Menú no encontrado en estas dos semanas.", 404);

    if (capacity < offer.reservedCount)
      fail("El cupo no puede ser menor que las porciones reservadas.", 409);

    if (capacity === offer.capacity) return { ok: true };
    await db.query(
      `UPDATE offers SET capacity=$2,
       sold_out_at=CASE WHEN reserved_count >= $2 THEN COALESCE(sold_out_at,$3) ELSE NULL END
       WHERE id=$1`,
      [offerId, capacity, new Date().toISOString()],
    );
    await db.query(
      `INSERT INTO admin_offer_events(id,offer_id,actor_user_id,previous_capacity,new_capacity)
       VALUES($1,$2,$3,$4,$5)`,
      [randomUUID(), offerId, actorId, offer.capacity, capacity],
    );

    return { ok: true };
  });
}
