import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db.mjs";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

async function itemsForReviews(client, reviews) {
  if (!reviews.length) return reviews;
  const items = await client.query(
    `SELECT i.id,i.order_id AS "orderId",i.dish_name AS name,i.image_url AS "imageUrl",i.quantity,
      ir.food_rating AS rating
     FROM order_items i LEFT JOIN order_item_reviews ir ON ir.order_item_id=i.id
     WHERE i.order_id=ANY($1::text[]) ORDER BY i.sort_order,i.id`,
    [reviews.map((review) => review.orderId)],
  );
  const byOrder = new Map();

  for (const item of items.rows) {
    if (!byOrder.has(item.orderId)) byOrder.set(item.orderId, []);
    byOrder.get(item.orderId).push({
      id: String(item.id),
      name: item.name,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      rating: item.rating,
    });
  }

  return reviews.map((review) => ({
    ...review,
    items: byOrder.get(review.orderId) || [],
  }));
}

export async function pendingReviewPrompt(userId) {
  const result = await getDb().query(
    `SELECT o.id AS "orderId",o.kitchen_name AS "kitchenName",o.code
     FROM orders o LEFT JOIN order_reviews r ON r.order_id=o.id
     WHERE o.user_id=$1 AND o.status='reservado' AND o.fulfillment_status='delivered'
       AND o.review_enabled=1 AND o.review_prompt_seen_at IS NULL AND r.order_id IS NULL
     ORDER BY COALESCE(o.delivered_at,o.created_at),o.id LIMIT 1`,
    [userId],
  );

  return (await itemsForReviews(getDb(), result.rows))[0] || null;
}

export async function markReviewPromptSeen(userId, orderId) {
  const updated = await getDb().query(
    `UPDATE orders SET review_prompt_seen_at=COALESCE(review_prompt_seen_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     WHERE id=$1 AND user_id=$2 AND status='reservado' AND fulfillment_status='delivered' AND review_enabled=1`,
    [orderId, userId],
  );

  if (!updated.rowCount) fail("Pedido no encontrado o aún no entregado.", 404);
  return { ok: true };
}

export async function recentKitchenReviews(kitchenId) {
  const kitchen = await getDb().query("SELECT id FROM kitchens WHERE id=$1", [kitchenId]);
  if (!kitchen.rowCount) fail("Cocina no encontrada.", 404);
  const result = await getDb().query(
    `SELECT r.order_id AS "orderId",r.comment,r.created_at AS "createdAt"
     FROM order_reviews r JOIN orders o ON o.id=r.order_id
     WHERE o.kitchen_id=$1 AND o.status='reservado' AND o.fulfillment_status='delivered'
       AND r.banned_at IS NULL AND trim(r.comment)<>''
     ORDER BY r.created_at DESC,r.order_id DESC LIMIT 5`,
    [kitchenId],
  );

  return { reviews: await itemsForReviews(getDb(), result.rows) };
}

export async function adminReviews({ kitchen = "all", status = "all", limit = 20, offset = 0 } = {}) {
  if (kitchen !== "all" && !/^[a-zA-Z0-9-]{1,100}$/.test(kitchen))
    fail("Filtro de cocina inválido.");
  if (!["all", "visible", "banned"].includes(status)) fail("Filtro de estado inválido.");
  const filter = `($1='all' OR o.kitchen_id=$1) AND
    ($2='all' OR ($2='visible' AND r.banned_at IS NULL) OR ($2='banned' AND r.banned_at IS NOT NULL))`;
  const [rows, count, kitchens] = await Promise.all([
    getDb().query(
      `SELECT r.order_id AS "orderId",r.comment,
       r.created_at AS "createdAt",r.banned_at AS "bannedAt",r.banned_by AS "bannedBy",
       o.kitchen_id AS "kitchenId",o.kitchen_name AS "kitchenName",o.code,
       u.name AS "studentName"
       FROM order_reviews r JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=o.user_id
       WHERE ${filter} ORDER BY r.created_at DESC,r.order_id DESC LIMIT $3 OFFSET $4`,
      [kitchen, status, limit, offset],
    ),
    getDb().query(
      `SELECT count(*) AS total FROM order_reviews r JOIN orders o ON o.id=r.order_id WHERE ${filter}`,
      [kitchen, status],
    ),
    getDb().query("SELECT id,name FROM kitchens ORDER BY name"),
  ]);

  return {
    reviews: await itemsForReviews(getDb(), rows.rows),
    total: Number(count.rows[0].total),
    kitchens: kitchens.rows,
    limit,
    offset,
  };
}

export async function moderateReview(orderId, actorId, action) {
  if (!["ban", "restore"].includes(action)) fail("Acción de moderación inválida.");

  return transaction(async (client) => {
    const current = await client.query(
      "SELECT banned_at AS \"bannedAt\" FROM order_reviews WHERE order_id=$1",
      [orderId],
    );
    if (!current.rowCount) fail("Reseña no encontrada.", 404);
    if (Boolean(current.rows[0].bannedAt) === (action === "ban"))
      fail("La reseña ya tiene ese estado.", 409);
    await client.query(
      `UPDATE order_reviews SET banned_at=$2,banned_by=$3 WHERE order_id=$1`,
      [orderId, action === "ban" ? new Date().toISOString() : null, action === "ban" ? actorId : null],
    );
    await client.query(
      "INSERT INTO review_moderation_events(id,order_id,actor_user_id,action) VALUES($1,$2,$3,$4)",
      [randomUUID(), orderId, actorId, action],
    );
    return { ok: true };
  });
}
