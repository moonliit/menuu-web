import { randomUUID, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { getDb, transaction } from "./db.mjs";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};

export function pushEnabled() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT && process.env.PUSH_DISPATCH_SECRET?.length >= 24);
}

export function pushConfig() {
  return { enabled: pushEnabled(), publicKey: pushEnabled() ? process.env.VAPID_PUBLIC_KEY : null };
}

function validEndpoint(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
       host === "web.push.apple.com" || host.endsWith(".notify.windows.com"));
  } catch { return false; }
}

export async function savePushSubscription(userId, subscription) {
  if (!pushEnabled()) fail("Los avisos aún no están configurados.", 503);
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!validEndpoint(endpoint) || typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{80,120}$/.test(p256dh) ||
      typeof auth !== "string" || !/^[A-Za-z0-9_-]{16,40}$/.test(auth))
    fail("Suscripción de notificaciones inválida.");
  await getDb().query(
    `INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth`,
    [randomUUID(), userId, endpoint, p256dh, auth],
  );
  return { ok: true };
}

export async function removePushSubscription(userId, endpoint) {
  if (!validEndpoint(endpoint)) fail("Suscripción inválida.");
  await getDb().query("DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2", [userId, endpoint]);
  return { ok: true };
}

export function validDispatchSecret(header) {
  const expected = process.env.PUSH_DISPATCH_SECRET;
  if (!expected || expected.length < 24 || typeof header !== "string") return false;
  const actual = header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function pickupStart(order) {
  return new Date(`${order.date}T${order.deliveryTime}:00-05:00`).getTime();
}

function limaDate(now) {
  return new Date(now.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

export async function dispatchPickupReminders(now = new Date(), send = webpush.sendNotification) {
  if (!pushEnabled()) fail("Los avisos aún no están configurados.", 503);
  const startDate = limaDate(now);
  const endDate = limaDate(new Date(now.getTime() + 86400_000));
  const result = await getDb().query(
    `SELECT r.id AS "orderId",r.offer_date AS date,r.delivery_time AS "deliveryTime",
       r.kitchen_name AS "kitchenName",s.id AS "subscriptionId",s.endpoint,s.p256dh,s.auth,
       (SELECT group_concat(dish_name, ', ') FROM order_items WHERE order_id=r.id) AS dishes
     FROM orders r JOIN push_subscriptions s ON s.user_id=r.user_id
     WHERE r.status='reservado' AND r.fulfillment_status='pending'
       AND r.offer_date BETWEEN $1 AND $2`,
    [startDate, endDate],
  );
  let sent = 0;
  let failed = 0;
  for (const order of result.rows) {
    const due = pickupStart(order) - 5 * 60_000;
    if (!Number.isFinite(due) || now.getTime() < due || now.getTime() >= due + 60_000) continue;
    const claimed = await transaction(async (db) => db.query(
      `INSERT OR IGNORE INTO push_reminders(order_id,subscription_id,claimed_at)
       VALUES ($1,$2,$3)`,
      [order.orderId, order.subscriptionId, now.toISOString()],
    ));
    if (!claimed.rowCount) continue;
    const title = "Tu pedido está por llegar";
    const body = `${order.dishes || "Tu comida"} de ${order.kitchenName}: recojo en 5 minutos en la Entrada del Comedor UTEC en piso 2.`;
    try {
      await send(
        { endpoint: order.endpoint, keys: { p256dh: order.p256dh, auth: order.auth } },
        JSON.stringify({ title, body, tag: `menuu-${order.orderId}` }),
        { vapidDetails: { subject: process.env.VAPID_SUBJECT,
          publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY },
          TTL: 60, urgency: "high" },
      );
      await getDb().query(
        "UPDATE push_reminders SET sent_at=$3 WHERE order_id=$1 AND subscription_id=$2",
        [order.orderId, order.subscriptionId, new Date().toISOString()],
      );
      sent += 1;
    } catch (cause) {
      failed += 1;
      if (cause?.statusCode === 404 || cause?.statusCode === 410)
        await getDb().query("DELETE FROM push_subscriptions WHERE id=$1", [order.subscriptionId]);
      else
        await getDb().query(
          "DELETE FROM push_reminders WHERE order_id=$1 AND subscription_id=$2 AND sent_at IS NULL",
          [order.orderId, order.subscriptionId],
        );
      console.error("No se pudo enviar un aviso de recojo:", cause);
    }
  }
  return { sent, failed };
}
