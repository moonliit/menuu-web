import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db.mjs";
import { weekStart } from "./catalog.mjs";

const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const soles = (value) => Math.round(Number(value) * 100);
const todayLima = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const text = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max + 1) : "";
const validTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
  new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const validUrl = (value) =>
  typeof value === "string" &&
  (value.startsWith("/images/") ||
    /^\/api\/kitchen\/image\/[a-f0-9-]{36}$/.test(value) ||
    /^https:\/\//.test(value)) &&
  value.length <= 500;

function validateOptions(groups) {
  if (!Array.isArray(groups) || groups.length > 8)
    fail("Revisa los grupos de personalización.");
  const ids = new Set();

  return groups.map((group, index) => {
    const title = text(group?.title, 60);
    const id =
      typeof group?.id === "string" && /^[a-zA-Z0-9_-]{1,60}$/.test(group.id)
        ? group.id
        : `grupo-${index + 1}`;

    if (!title || title.length > 60 || ids.has(id))
      fail("Cada grupo necesita un nombre distinto.");
    ids.add(id);
    const selectionType =
      group.selectionType === "multiple" ? "multiple" : "single";
    const required = Boolean(group.required);
    const maxSelections =
      selectionType === "single"
        ? 1
        : group.maxSelections == null || group.maxSelections === ""
          ? null
          : Number(group.maxSelections);

    if (
      maxSelections !== null &&
      (!Number.isInteger(maxSelections) || maxSelections < 1)
    )
      fail("El límite de elecciones no es válido.");

    if (
      !Array.isArray(group.choices) ||
      group.choices.length < 2 ||
      group.choices.length > 16
    )
      fail("Cada grupo necesita de 2 a 16 opciones.");
    const choiceIds = new Set();
    const choices = group.choices.map((choice, choiceIndex) => {
      const label = text(choice?.label, 60);
      const choiceId =
        typeof choice?.id === "string" &&
        /^[a-zA-Z0-9_-]{1,60}$/.test(choice.id)
          ? choice.id
          : `opcion-${choiceIndex + 1}`;
      const priceCents = soles(choice?.priceSoles ?? 0);

      if (
        !label ||
        label.length > 60 ||
        choiceIds.has(choiceId) ||
        !Number.isInteger(priceCents) ||
        priceCents < 0 ||
        priceCents > 10000
      )
        fail("Revisa el nombre y precio de cada opción.");
      choiceIds.add(choiceId);

      return { id: choiceId, label, priceCents };
    });

    if (maxSelections !== null && maxSelections > choices.length)
      fail("El límite supera la cantidad de opciones.");

    return { id, title, selectionType, required, maxSelections, choices };
  });
}

async function replaceOptions(client, scope, kitchenId, id, groups) {
  const offer = scope === "offer";
  const groupTable = offer ? "offer_option_groups" : "option_groups";
  const choiceTable = offer ? "offer_option_choices" : "option_choices";
  const where = offer ? "offer_id=$1" : "kitchen_id=$1 AND dish_id=$2";
  const args = offer ? [id] : [kitchenId, id];

  await client.query(`DELETE FROM ${choiceTable} WHERE ${where}`, args);
  await client.query(`DELETE FROM ${groupTable} WHERE ${where}`, args);
  for (const [sort, group] of groups.entries()) {
    if (offer)
      await client.query(
        "INSERT INTO offer_option_groups (offer_id,id,title,selection_type,required,max_selections,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          group.id,
          group.title,
          group.selectionType,
          group.required,
          group.maxSelections,
          sort,
        ],
      );
    else
      await client.query(
        "INSERT INTO option_groups (kitchen_id,dish_id,id,title,selection_type,required,max_selections,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          kitchenId,
          id,
          group.id,
          group.title,
          group.selectionType,
          group.required,
          group.maxSelections,
          sort,
        ],
      );
    for (const [choiceSort, choice] of group.choices.entries()) {
      if (offer)
        await client.query(
          "INSERT INTO offer_option_choices (offer_id,group_id,id,label,price_cents,sort_order) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            id,
            group.id,
            choice.id,
            choice.label,
            choice.priceCents,
            choiceSort,
          ],
        );
      else
        await client.query(
          "INSERT INTO option_choices (kitchen_id,dish_id,group_id,id,label,price_cents,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [
            kitchenId,
            id,
            group.id,
            choice.id,
            choice.label,
            choice.priceCents,
            choiceSort,
          ],
        );
    }
  }
}

async function loadOptions(client, scope, kitchenId) {
  const offer = scope === "offer";
  const groups = (
    await client.query(
      offer
        ? `SELECT g.offer_id AS parent,g.id,g.title,g.selection_type AS "selectionType",g.required,g.max_selections AS "maxSelections" FROM offer_option_groups g JOIN offers o ON o.id=g.offer_id WHERE o.kitchen_id=$1 ORDER BY g.sort_order,g.id`
        : `SELECT dish_id AS parent,id,title,selection_type AS "selectionType",required,max_selections AS "maxSelections" FROM option_groups WHERE kitchen_id=$1 ORDER BY sort_order,id`,
      [kitchenId],
    )
  ).rows;
  const choices = (
    await client.query(
      offer
        ? `SELECT c.offer_id AS parent,c.group_id AS "groupId",c.id,c.label,c.price_cents AS "priceCents" FROM offer_option_choices c JOIN offers o ON o.id=c.offer_id WHERE o.kitchen_id=$1 ORDER BY c.sort_order,c.id`
        : `SELECT dish_id AS parent,group_id AS "groupId",id,label,price_cents AS "priceCents" FROM option_choices WHERE kitchen_id=$1 ORDER BY sort_order,id`,
      [kitchenId],
    )
  ).rows;
  const byParent = new Map(),
    byGroup = new Map();

  for (const row of groups) {
    const group = {
      id: row.id,
      title: row.title,
      selectionType: row.selectionType,
      required: row.required,
      maxSelections: row.maxSelections,
      choices: [],
    };

    if (!byParent.has(row.parent)) byParent.set(row.parent, []);
    byParent.get(row.parent).push(group);
    byGroup.set(`${row.parent}:${row.id}`, group);
  }
  for (const row of choices)
    byGroup.get(`${row.parent}:${row.groupId}`)?.choices.push({
      id: row.id,
      label: row.label,
      priceSoles: row.priceCents / 100,
    });

  return byParent;
}

export async function kitchenData(kitchenId, { includeAnalytics = true } = {}) {
  const db = getDb();
  const start = weekStart();
  const today = todayLima();
  const since = new Date(Date.now() - 28 * 86400_000).toISOString();
  const [
    profile,
    dishes,
    offers,
    stats,
    hours,
    timeline,
    orders,
    reservations,
  ] = await Promise.all([
    db.query(
      'SELECT id,name,description,logo_url AS "logoUrl",image_url AS "imageUrl" FROM kitchens WHERE id=$1',
      [kitchenId],
    ),
    db.query(
      'SELECT id,name,description,price_cents AS "priceCents",image_url AS "imageUrl",image_alt AS "imageAlt",active FROM dishes WHERE kitchen_id=$1 ORDER BY active DESC,name',
      [kitchenId],
    ),
    db.query(
      `SELECT id,dish_id AS "dishId",offer_date AS date,delivery_time AS "deliveryTime",COALESCE(pickup_until_extended,pickup_until) AS "pickupUntil",booking_deadline_at AS "bookingDeadline",capacity,reserved_count AS "reservedCount",description_override AS "descriptionOverride",price_override_cents AS "priceOverrideCents",customization_override AS "hasCustomizationOverride",published_at AS "publishedAt",sold_out_at AS "soldOutAt" FROM offers WHERE kitchen_id=$1 AND offer_date >= $2 AND offer_date < date($2, '+14 days') ORDER BY offer_date,delivery_time,id`,
      [kitchenId, start],
    ),
    includeAnalytics ? db.query(
      `SELECT o.id,o.dish_id AS "dishId",d.name AS "dishName",o.offer_date AS date,o.capacity,o.reserved_count AS "reservedCount",o.published_at AS "publishedAt",o.sold_out_at AS "soldOutAt",COALESCE(sum(i.quantity) FILTER (WHERE r.status='reservado' AND r.fulfillment_status<>'no_show' AND (r.payment_checkout_id IS NULL OR p.status='approved')),0) AS units,COALESCE(sum(i.total_cents) FILTER (WHERE r.status='reservado' AND r.fulfillment_status<>'no_show' AND (r.payment_checkout_id IS NULL OR p.status='approved')),0) AS "revenueCents",count(DISTINCT r.id) FILTER (WHERE r.status='reservado' AND r.fulfillment_status<>'no_show' AND (r.payment_checkout_id IS NULL OR p.status='approved')) AS "orderCount",min(r.created_at) FILTER (WHERE r.status='reservado' AND r.fulfillment_status<>'no_show' AND (r.payment_checkout_id IS NULL OR p.status='approved')) AS "firstBookingAt" FROM offers o JOIN dishes d ON d.kitchen_id=o.kitchen_id AND d.id=o.dish_id LEFT JOIN order_items i ON i.offer_id=o.id LEFT JOIN orders r ON r.id=i.order_id AND r.created_at >= $2 LEFT JOIN payment_checkouts p ON p.id=r.payment_checkout_id WHERE o.kitchen_id=$1 AND o.offer_date >= date($3, '-28 days') AND o.offer_date < date($3, '+14 days') GROUP BY o.id,d.name ORDER BY o.offer_date DESC,o.id`,
      [kitchenId, since, today],
    ) : { rows: [] },
    includeAnalytics ? db.query(
      `SELECT CAST(strftime('%H',r.created_at,'-5 hours') AS INTEGER) AS hour,sum(i.quantity) AS units FROM orders r JOIN order_items i ON i.order_id=r.id JOIN offers o ON o.id=i.offer_id WHERE o.kitchen_id=$1 AND r.status='reservado' AND r.fulfillment_status<>'no_show' AND (r.payment_checkout_id IS NULL OR EXISTS(SELECT 1 FROM payment_checkouts p WHERE p.id=r.payment_checkout_id AND p.status='approved')) AND r.created_at >= $2 GROUP BY hour ORDER BY hour`,
      [kitchenId, since],
    ) : { rows: [] },
    includeAnalytics ? db.query(
      `SELECT i.offer_id AS "offerId",strftime('%Y-%m-%d %H:00',r.created_at,'-5 hours') AS hour,sum(i.quantity) AS units FROM orders r JOIN order_items i ON i.order_id=r.id JOIN offers o ON o.id=i.offer_id WHERE o.kitchen_id=$1 AND r.status='reservado' AND r.fulfillment_status<>'no_show' AND (r.payment_checkout_id IS NULL OR EXISTS(SELECT 1 FROM payment_checkouts p WHERE p.id=r.payment_checkout_id AND p.status='approved')) AND r.created_at >= $2 GROUP BY i.offer_id,hour ORDER BY hour`,
      [kitchenId, since],
    ) : { rows: [] },
    includeAnalytics ? db.query(
      `SELECT count(DISTINCT id) AS count FROM orders WHERE kitchen_id=$1 AND status='reservado' AND fulfillment_status<>'no_show' AND (payment_checkout_id IS NULL OR EXISTS(SELECT 1 FROM payment_checkouts p WHERE p.id=payment_checkout_id AND p.status='approved')) AND created_at >= $2`,
      [kitchenId, since],
    ) : { rows: [{ count: 0 }] },
    db.query(
      `SELECT i.offer_id AS "offerId",i.id AS "orderItemId",r.id AS "orderId",r.code,u.name AS "studentName",u.email AS "studentEmail",i.quantity,i.unit_price_cents AS "unitPriceCents",i.delivered_quantity AS "deliveredQuantity",i.booking_deadline_at AS "bookingDeadlineAt",r.status,r.fulfillment_status AS "fulfillmentStatus",r.payment_recorded AS "paymentRecorded",r.delivered_at AS "deliveredAt",r.created_at AS "createdAt",r.payment_checkout_id AS "paymentCheckoutId",p.status AS "paymentStatus",
         EXISTS(SELECT 1 FROM kitchen_reservation_events e WHERE e.order_id=r.id AND e.action='manual_add') AS "manualAdded",
         EXISTS(SELECT 1 FROM kitchen_reservation_events e WHERE e.order_id=r.id AND e.action='extra_portion') AS "extraPortion"
         FROM orders r JOIN order_items i ON i.order_id=r.id JOIN users u ON u.id=r.user_id JOIN offers o ON o.id=i.offer_id LEFT JOIN payment_checkouts p ON p.id=r.payment_checkout_id
         WHERE r.kitchen_id=$1 AND o.kitchen_id=$1 AND o.offer_date >= $2 AND o.offer_date < date($2, '+14 days')
           AND NOT EXISTS(SELECT 1 FROM kitchen_reservation_events e WHERE e.order_id=r.id AND e.action='manual_remove')
         ORDER BY o.offer_date,o.delivery_time,u.name,r.created_at`,
      [kitchenId, start],
    ),
  ]);

  if (!profile.rows[0]) fail("Cocina no encontrada.", 404);
  const [dishOptions, offerOptions] = await Promise.all([
    loadOptions(db, "dish", kitchenId),
    loadOptions(db, "offer", kitchenId),
  ]);

  return {
    profile: profile.rows[0],
    dishes: dishes.rows.map((row) => ({
      ...row,
      priceSoles: row.priceCents / 100,
      customization: dishOptions.get(row.id) || [],
    })),
    offers: offers.rows.map((row) => ({
      ...row,
      priceSoles:
        row.priceOverrideCents == null ? null : row.priceOverrideCents / 100,
      customization: offerOptions.get(row.id) || [],
    })),
    reservations: reservations.rows,
    analytics: includeAnalytics
      ? {
          offers: stats.rows,
          bookingHours: hours.rows,
          bookingTimeline: timeline.rows,
          totalOrders: orders.rows[0].count,
        }
      : null,
  };
}

const paymentMethods = new Set(["QR", "Efectivo", "Transferencia", "Otro"]);

export async function kitchenStudentCandidates(
  kitchenId,
  offerId,
  search = "",
  page = null,
) {
  const query = text(search, 80);

  if (query.length > 80) fail("Búsqueda demasiado larga.");
  const offer = await getDb().query(
    "SELECT id FROM offers WHERE id=$1 AND kitchen_id=$2",
    [offerId, kitchenId],
  );

  if (!offer.rowCount) fail("Menú no encontrado.", 404);
  const where = `FROM users u WHERE u.role='consumer'
       AND (u.name LIKE $2 OR u.email LIKE $2)
       AND NOT EXISTS (SELECT 1 FROM orders r WHERE r.user_id=u.id AND r.status='reservado' AND r.fulfillment_status='no_show')`;
  const args = [offerId, `%${query.replace(/[%_]/g, "")}%`];
  const students = (
    await getDb().query(
      `SELECT u.id,u.name,u.email,
       EXISTS(SELECT 1 FROM orders r JOIN order_items i ON i.order_id=r.id
         WHERE r.user_id=u.id AND i.offer_id=$1 AND r.status='reservado' AND r.fulfillment_status<>'no_show') AS "alreadyAdded"
       ${where} ORDER BY u.name,u.email LIMIT $3 OFFSET $4`,
      [...args, page?.limit ?? 30, page?.offset ?? 0],
    )
  ).rows;

  if (!page) return students;
  const count = await getDb().query(`SELECT count(*) AS total ${where}`, args);

  return { students, total: Number(count.rows[0].total) };
}

export async function addKitchenReservation(kitchenId, actorId, data) {
  const offerId = typeof data?.offerId === "string" ? data.offerId : "";
  const studentId = typeof data?.studentId === "string" ? data.studentId : "";
  const quantity = Number(data?.quantity ?? 1);

  if (
    !offerId ||
    !studentId ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 10
  )
    fail("Revisa el estudiante y la cantidad de porciones.");

  return transaction(async (db) => {
    const offer = (
      await db.query(
        `SELECT o.id,o.kitchen_id AS "kitchenId",o.offer_date AS date,o.delivery_time AS "deliveryTime",COALESCE(o.pickup_until_extended,o.pickup_until) AS "pickupUntil",o.booking_deadline_at AS "bookingDeadline",o.capacity,o.reserved_count AS "reservedCount",d.name AS "dishName",d.image_url AS "imageUrl",COALESCE(o.price_override_cents,d.price_cents) AS "priceCents",k.name AS "kitchenName"
         FROM offers o JOIN dishes d ON d.kitchen_id=o.kitchen_id AND d.id=o.dish_id JOIN kitchens k ON k.id=o.kitchen_id
         WHERE o.id=$1 AND o.kitchen_id=$2`,
        [offerId, kitchenId],
      )
    ).rows[0];

    if (!offer) fail("Menú no encontrado.", 404);
    const student = (
      await db.query("SELECT id FROM users WHERE id=$1 AND role='consumer'", [
        studentId,
      ])
    ).rows[0];

    if (!student) fail("Estudiante no encontrado.", 404);

    if (
      (
        await db.query(
          `SELECT 1 FROM orders r JOIN order_items i ON i.order_id=r.id WHERE r.user_id=$1 AND i.offer_id=$2 AND r.status='reservado' AND r.fulfillment_status<>'no_show' LIMIT 1`,
          [studentId, offerId],
        )
      ).rowCount
    )
      fail("Este estudiante ya tiene una reserva en este menú.", 409);

    if (
      (
        await db.query(
          "SELECT 1 FROM orders WHERE user_id=$1 AND status='reservado' AND fulfillment_status='no_show' LIMIT 1",
          [studentId],
        )
      ).rowCount
    )
      fail("Este estudiante tiene una ausencia pendiente de revisión.", 409);
    const stock = await db.query(
      `UPDATE offers SET reserved_count=reserved_count+$3,sold_out_at=CASE WHEN reserved_count+$3=capacity THEN $4 ELSE sold_out_at END
       WHERE id=$1 AND kitchen_id=$2 AND reserved_count+$3<=capacity RETURNING id`,
      [offerId, kitchenId, quantity, new Date().toISOString()],
    );

    if (!stock.rowCount) fail("No quedan suficientes porciones.", 409);
    const orderId = randomUUID();
    const total = offer.priceCents * quantity;
    const extraordinary =
      Date.now() >=
      new Date(`${offer.date}T${offer.pickupUntil}:00-05:00`).getTime();
    const createdAt = new Date().toISOString();

    await db.query(
      `INSERT INTO orders(id,code,user_id,kitchen_id,kitchen_name,offer_date,delivery_time,pickup_until,pickup_point,status,payment,total_cents,fulfillment_status,created_at,delivered_at,review_enabled)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reservado','QR al recibir',$10,$11,$12,$13,$14)`,
      [
        orderId,
        `MU-${randomUUID().slice(0, 8).toUpperCase()}`,
        studentId,
        kitchenId,
        offer.kitchenName,
        offer.date,
        offer.deliveryTime,
        offer.pickupUntil,
        "Entrada del Comedor UTEC en piso 2",
        total,
        extraordinary ? "delivered" : "pending",
        createdAt,
        extraordinary ? createdAt : null,
        extraordinary,
      ],
    );
    const addedItem = await db.query(
      `INSERT INTO order_items(order_id,offer_id,dish_name,image_url,quantity,unit_price_cents,total_cents,delivered_quantity,booking_deadline_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        orderId,
        offerId,
        offer.dishName,
        offer.imageUrl,
        quantity,
        offer.priceCents,
        total,
        extraordinary ? quantity : null,
        offer.bookingDeadline,
      ],
    );

    await db.query(
      "INSERT INTO kitchen_reservation_events(id,order_id,actor_user_id,action,detail) VALUES($1,$2,$3,'manual_add',$4)",
      [
        randomUUID(),
        orderId,
        actorId,
        `${quantity} porción(es) en ${offerId}${extraordinary ? " · extraordinaria entregada" : ""}`,
      ],
    );

    return { orderId, orderItemId: addedItem.rows[0].id, extraordinary };
  });
}

export async function removeKitchenReservation(kitchenId, actorId, data) {
  const orderId = typeof data?.orderId === "string" ? data.orderId : "";
  if (!orderId) fail("Selecciona el alta manual que quieres eliminar.");

  return transaction(async (db) => {
    const order = (await db.query(
      `SELECT id,status,fulfillment_status AS "fulfillmentStatus",payment_checkout_id AS "paymentCheckoutId",
       EXISTS(SELECT 1 FROM kitchen_reservation_events e WHERE e.order_id=orders.id AND e.action='manual_add') AS "manualAdded",
       EXISTS(SELECT 1 FROM order_reviews r WHERE r.order_id=orders.id) AS "hasReview"
       FROM orders WHERE id=$1 AND kitchen_id=$2`,
      [orderId, kitchenId],
    )).rows[0];
    if (!order) fail("Reserva no encontrada.", 404);
    if (!order.manualAdded || order.paymentCheckoutId)
      fail("Solo se pueden eliminar altas manuales sin Yape anticipado.", 409);
    if (order.status !== "reservado") fail("Esta alta manual ya fue anulada.", 409);
    if (order.hasReview)
      fail("Esta entrega ya tiene una reseña. Contacta a administración para revisarla.", 409);

    const items = (await db.query(
      `SELECT i.offer_id AS "offerId",i.quantity,i.delivered_quantity AS "deliveredQuantity"
       FROM order_items i JOIN offers o ON o.id=i.offer_id
       WHERE i.order_id=$1 AND o.kitchen_id=$2`,
      [orderId, kitchenId],
    )).rows;
    if (!items.length) fail("La reserva no tiene platos de esta cocina.", 409);
    const released = new Map();
    for (const item of items) {
      const units = order.fulfillmentStatus === "no_show"
        ? 0
        : order.fulfillmentStatus === "delivered"
          ? (item.deliveredQuantity ?? item.quantity)
          : item.quantity;
      released.set(item.offerId, (released.get(item.offerId) || 0) + units);
    }
    for (const [offerId, units] of released) {
      if (!units) continue;
      const changed = await db.query(
        `UPDATE offers SET reserved_count=reserved_count-$3,sold_out_at=NULL
         WHERE id=$1 AND kitchen_id=$2 AND reserved_count>=$3 RETURNING id`,
        [offerId, kitchenId, units],
      );
      if (!changed.rowCount) fail("No se pudo liberar el cupo de este menú.", 409);
    }
    const now = new Date().toISOString();
    await db.query(
      `UPDATE orders SET status='cancelado',review_enabled=0,cancelled_at=$3
       WHERE id=$1 AND kitchen_id=$2 AND status='reservado'`,
      [orderId, kitchenId, now],
    );
    await db.query(
      "INSERT INTO kitchen_reservation_events(id,order_id,actor_user_id,action,detail) VALUES($1,$2,$3,'manual_remove',$4)",
      [randomUUID(), orderId, actorId, `Alta manual anulada; ${[...released.values()].reduce((sum, units) => sum + units, 0)} porción(es) liberada(s)`],
    );
    return { ok: true };
  });
}

export async function updateKitchenReservation(
  kitchenId,
  actorId,
  data,
  allowDeliveryTimeEdit = false,
) {
  const orderId = typeof data?.orderId === "string" ? data.orderId : "";
  const action = data?.action;

  if (!orderId || !["deliver", "cancel", "reset", "payment"].includes(action))
    fail("Cambio de reserva inválido.");

  if (
    data?.deliveredAt !== undefined &&
    (!allowDeliveryTimeEdit || action !== "deliver")
  )
    fail("Solo admin puede cambiar la fecha de entrega.", 403);
  let requestedDeliveredAt = null;

  if (data?.deliveredAt !== undefined) {
    const value = data.deliveredAt;
    const [date, time] = typeof value === "string" ? value.split("T") : [];

    if (!validDate(date) || !validTime(time))
      fail("Indica una fecha y hora de entrega válidas.");
    const moment = new Date(`${date}T${time}:00-05:00`);

    if (moment.getTime() > Date.now())
      fail("La entrega no puede tener una fecha futura.");
    requestedDeliveredAt = moment.toISOString();
  }

  return transaction(async (db) => {
    const order = (
      await db.query(
        `SELECT id,status,fulfillment_status AS "fulfillmentStatus",delivered_at AS "deliveredAt",offer_date AS date,pickup_until AS "pickupUntil",created_at AS "createdAt",payment_checkout_id AS "paymentCheckoutId",
         EXISTS(SELECT 1 FROM kitchen_reservation_events e WHERE e.order_id=orders.id AND e.action='manual_add') AS "manualAdded"
         FROM orders WHERE id=$1 AND kitchen_id=$2`,
        [orderId, kitchenId],
      )
    ).rows[0];

    if (!order) fail("Reserva no encontrada.", 404);

    if (order.status !== "reservado")
      fail("Esta reserva ya está cancelada.", 409);
    if (order.paymentCheckoutId) {
      const payment = (await db.query("SELECT status FROM payment_checkouts WHERE id=$1", [order.paymentCheckoutId])).rows[0];
      if (payment?.status !== "approved") fail("El Yape anticipado debe aprobarse antes de gestionar la entrega.", 409);
      if (action === "payment") fail("El Yape anticipado ya fue aprobado; no cambies su medio de pago.", 409);
      if (action === "deliver" && data.paymentMethod !== "QR") fail("La reserva anticipada se pagó con QR.", 409);
    }
    const items = (
      await db.query(
        `SELECT i.id,i.offer_id AS "offerId",i.quantity,i.delivered_quantity AS "deliveredQuantity"
         FROM order_items i JOIN offers o ON o.id=i.offer_id
         WHERE i.order_id=$1 AND o.kitchen_id=$2`,
        [orderId, kitchenId],
      )
    ).rows;

    if (!items.length) fail("La reserva no tiene platos.", 409);
    let detail = "";

    if (action === "payment") {
      if (order.fulfillmentStatus !== "delivered")
        fail("Registra el pago al marcar la reserva como entregada.", 409);

      if (!paymentMethods.has(data.paymentMethod))
        fail("Selecciona un medio de pago válido.");
      await db.query(
        "UPDATE orders SET payment_recorded=$3 WHERE id=$1 AND kitchen_id=$2",
        [orderId, kitchenId, data.paymentMethod],
      );
      detail = data.paymentMethod;
    } else {
      if (action === "deliver" && !paymentMethods.has(data.paymentMethod))
        fail("Selecciona un medio de pago válido.");

      if (
        action === "cancel" &&
        Date.now() <
          new Date(`${order.date}T${order.pickupUntil}:00-05:00`).getTime()
      )
        fail(
          "Espera hasta que termine la ventana de recojo para marcar ausencia.",
          409,
        );

      if (
        action === "cancel" &&
        new Date(order.createdAt).getTime() >
          new Date(`${order.date}T${order.pickupUntil}:00-05:00`).getTime()
      )
        fail(
          "Una reserva extraordinaria posterior al recojo no se puede marcar como ausencia.",
          409,
        );

      if (action === "cancel" && order.fulfillmentStatus === "delivered")
        fail(
          "Una entrega registrada no se puede marcar como ausencia. Corrige primero su estado.",
          409,
        );
      const fulfillment =
        action === "deliver"
          ? "delivered"
          : action === "cancel"
            ? "no_show"
            : "pending";
      const deliveredAt =
        action === "deliver"
          ? requestedDeliveredAt ||
            (order.fulfillmentStatus === "delivered" && order.deliveredAt) ||
            new Date().toISOString()
          : null;
      const pickupEnd = new Date(
        `${order.date}T${order.pickupUntil}:00-05:00`,
      ).getTime();
      const extraordinaryManual =
        order.manualAdded && new Date(order.createdAt).getTime() >= pickupEnd;

      if (
        action === "deliver" &&
        requestedDeliveredAt &&
        extraordinaryManual &&
        new Date(requestedDeliveredAt).getTime() < pickupEnd
      )
        fail("La entrega extemporánea no puede ser anterior al fin de recojo.");
      const selectedId = Number(data.orderItemId);
      const selectedItem =
        items.find((item) => item.id === selectedId) ||
        (items.length === 1 ? items[0] : null);
      const deliveredQuantity = Number(data.deliveredQuantity);

      if (
        action === "deliver" &&
        (!selectedItem ||
          !Number.isInteger(deliveredQuantity) ||
          deliveredQuantity < 1)
      )
        fail("Indica entre 1 y el cupo disponible de porciones entregadas.");
      if (action === "deliver" && order.paymentCheckoutId && deliveredQuantity > selectedItem.quantity)
        fail("La porción adicional debe registrarse como una venta aparte con su propio medio de pago.", 409);
      const changes = new Map();

      for (const item of items) {
        const previous =
          order.fulfillmentStatus === "no_show"
            ? 0
            : order.fulfillmentStatus === "delivered"
              ? (item.deliveredQuantity ?? item.quantity)
              : item.quantity;
        const next =
          fulfillment === "no_show"
            ? 0
            : fulfillment === "pending"
              ? item.quantity
              : item.id === selectedItem.id
                ? deliveredQuantity
                : (item.deliveredQuantity ?? item.quantity);

        changes.set(
          item.offerId,
          (changes.get(item.offerId) || 0) + next - previous,
        );

        if (action === "deliver")
          await db.query(
            "UPDATE order_items SET delivered_quantity=$2 WHERE id=$1",
            [item.id, next],
          );
        else if (action === "reset")
          await db.query(
            "UPDATE order_items SET delivered_quantity=NULL WHERE id=$1",
            [item.id],
          );
      }
      for (const [offerId, delta] of changes) {
        if (!delta) continue;
        const changed = await db.query(
          `UPDATE offers SET reserved_count=reserved_count+$3,
           sold_out_at=CASE WHEN reserved_count+$3=capacity THEN COALESCE(sold_out_at,$4) ELSE NULL END
           WHERE id=$1 AND kitchen_id=$2 AND reserved_count+$3 BETWEEN 0 AND capacity RETURNING id`,
          [offerId, kitchenId, delta, new Date().toISOString()],
        );

        if (!changed.rowCount)
          fail(
            action === "reset"
              ? "No hay cupo para restaurar esta reserva. Amplía la capacidad del menú antes de corregirla."
              : "Las porciones entregadas exceden el cupo del menú. Reduce la cantidad o amplía el cupo.",
            409,
          );
      }
      await db.query(
        `UPDATE orders SET fulfillment_status=$3,pickup_confirmed=0,
         payment_recorded=CASE WHEN payment_checkout_id IS NOT NULL THEN 'QR' WHEN $3='delivered' THEN $4 ELSE NULL END,
         delivered_at=$5,
         created_at=CASE WHEN $6=1 THEN $5 ELSE created_at END,
         review_enabled=CASE WHEN $3='delivered' THEN 1 ELSE 0 END,
         review_prompt_seen_at=CASE WHEN $3='delivered' THEN review_prompt_seen_at ELSE NULL END
         WHERE id=$1 AND kitchen_id=$2`,
        [
          orderId,
          kitchenId,
          fulfillment,
          action === "deliver" ? data.paymentMethod : null,
          deliveredAt,
          Boolean(requestedDeliveredAt && extraordinaryManual),
        ],
      );
      detail =
        action === "deliver"
          ? `${fulfillment}: ${deliveredQuantity} porción(es), ${data.paymentMethod}, ${deliveredAt}`
          : fulfillment;
    }
    await db.query(
      "INSERT INTO kitchen_reservation_events(id,order_id,actor_user_id,action,detail) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), orderId, actorId, action, detail],
    );

    return { ok: true };
  });
}

export async function addExtraPortion(kitchenId, actorId, data, now = new Date()) {
  const sourceOrderId = typeof data?.orderId === "string" ? data.orderId : "";
  const sourceItemId = Number(data?.orderItemId);
  const quantity = Number(data?.quantity);
  const paymentMethod = data?.paymentMethod;
  if (!sourceOrderId || !Number.isInteger(sourceItemId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10)
    fail("Indica el pedido y entre 1 y 10 porciones adicionales.");
  if (!paymentMethods.has(paymentMethod)) fail("Selecciona el medio de pago de la porción adicional.");
  return transaction(async (db) => {
    const source = (await db.query(
      `SELECT r.id,r.user_id AS "userId",r.kitchen_id AS "kitchenId",r.kitchen_name AS "kitchenName",
       r.offer_date AS date,r.delivery_time AS "deliveryTime",r.pickup_until AS "pickupUntil",
       r.pickup_point AS "pickupPoint",r.status,r.payment_checkout_id AS "paymentCheckoutId",
       i.id AS "itemId",i.offer_id AS "offerId",i.dish_name AS "dishName",i.image_url AS "imageUrl",
       i.unit_price_cents AS "unitPriceCents",i.comment,i.booking_deadline_at AS "bookingDeadlineAt"
       FROM orders r JOIN order_items i ON i.order_id=r.id
       WHERE r.id=$1 AND i.id=$2 AND r.kitchen_id=$3`,
      [sourceOrderId, sourceItemId, kitchenId],
    )).rows[0];
    if (!source || source.status !== "reservado" || !source.paymentCheckoutId)
      fail("Selecciona una reserva previa pagada con Yape.", 409);
    const payment = (await db.query("SELECT status FROM payment_checkouts WHERE id=$1", [source.paymentCheckoutId])).rows[0];
    if (payment?.status !== "approved") fail("El Yape de la reserva previa aún no está aprobado.", 409);
    const pickupStart = new Date(`${source.date}T${source.deliveryTime}:00-05:00`);
    const pickupEnd = new Date(`${source.date}T${source.pickupUntil}:00-05:00`);
    if (now < pickupStart || now > pickupEnd) fail("La porción adicional solo se vende durante la ventana de recojo.", 409);
    const changed = await db.query(
      `UPDATE offers SET reserved_count=reserved_count+$3,
       sold_out_at=CASE WHEN reserved_count+$3=capacity THEN $4 ELSE sold_out_at END
       WHERE id=$1 AND kitchen_id=$2 AND reserved_count+$3<=capacity RETURNING id`,
      [source.offerId, kitchenId, quantity, now.toISOString()],
    );
    if (!changed.rowCount) fail("No quedan suficientes porciones adicionales.", 409);
    const orderId = randomUUID();
    const total = source.unitPriceCents * quantity;
    await db.query(
      `INSERT INTO orders(id,code,user_id,kitchen_id,kitchen_name,offer_date,delivery_time,pickup_until,pickup_point,status,payment,total_cents,fulfillment_status,payment_recorded,created_at,delivered_at,review_enabled)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reservado',$10,$11,'delivered',$12,$13,$13,1)`,
      [orderId, `MU-${randomUUID().slice(0,8).toUpperCase()}`, source.userId, kitchenId, source.kitchenName,
       source.date, source.deliveryTime, source.pickupUntil, source.pickupPoint, paymentMethod, total, paymentMethod, now.toISOString()],
    );
    const inserted = await db.query(
      `INSERT INTO order_items(order_id,offer_id,dish_name,image_url,quantity,comment,unit_price_cents,total_cents,delivered_quantity,booking_deadline_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [orderId, source.offerId, source.dishName, source.imageUrl, quantity, source.comment, source.unitPriceCents, total, quantity, source.bookingDeadlineAt],
    );
    await db.query(
      `INSERT INTO order_item_choices(order_item_id,group_id,group_title,choice_id,choice_label,price_cents,sort_order)
       SELECT $1,group_id,group_title,choice_id,choice_label,price_cents,sort_order FROM order_item_choices WHERE order_item_id=$2`,
      [inserted.rows[0].id, source.itemId],
    );
    await db.query(
      "INSERT INTO kitchen_reservation_events(id,order_id,actor_user_id,action,detail) VALUES($1,$2,$3,'extra_portion',$4)",
      [randomUUID(), orderId, actorId, `Origen: ${sourceOrderId}; ${quantity} porción(es); pago ${paymentMethod}`],
    );
    return { orderId };
  });
}

export async function updateKitchen(kitchenId, data) {
  const name = text(data?.name, 40),
    description = text(data?.description, 70);

  if (name.length < 2 || name.length > 40)
    fail("El nombre de tu cocina debe tener entre 2 y 40 caracteres.");

  if (description.length > 70)
    fail("La descripción de tu cocina puede tener hasta 70 caracteres.");
  await getDb().query(
    "UPDATE kitchens SET name=$2,description=$3 WHERE id=$1",
    [kitchenId, name, description],
  );
}

export async function saveKitchenImage(
  kitchenId,
  bytes,
  mime,
  updateLogo = true,
) {
  if (
    !["image/png", "image/jpeg"].includes(mime) ||
    bytes.length > 2_000_000 ||
    bytes.length < 20
  )
    fail("Sube una imagen PNG o JPG de hasta 2 MB.");
  const signature =
    mime === "image/png"
      ? bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  if (!signature)
    fail("El archivo no corresponde al formato de imagen indicado.");
  const id = randomUUID();

  await transaction(async (client) => {
    await client.query(
      "INSERT INTO kitchen_images(id,kitchen_id,mime_type,content) VALUES ($1,$2,$3,$4)",
      [id, kitchenId, mime, bytes],
    );

    if (updateLogo)
      await client.query("UPDATE kitchens SET logo_url=$2 WHERE id=$1", [
        kitchenId,
        `/api/kitchen/image/${id}`,
      ]);
  });

  return `/api/kitchen/image/${id}`;
}

export async function kitchenImage(id) {
  const image = (
    await getDb().query(
      "SELECT mime_type AS mime,content FROM kitchen_images WHERE id=$1",
      [id],
    )
  ).rows[0];

  return image ? { ...image, content: Buffer.from(image.content) } : null;
}

export async function saveDish(kitchenId, data) {
  const id = data?.id || randomUUID(),
    name = text(data?.name, 80),
    description = text(data?.description, 90),
    imageAlt = text(data?.imageAlt, 120);
  const priceCents = soles(data?.priceSoles);

  if (
    !name ||
    name.length > 80 ||
    description.length > 90 ||
    !Number.isInteger(priceCents) ||
    priceCents < 0 ||
    priceCents > 100000 ||
    !validUrl(data?.imageUrl)
  )
    fail("Revisa el nombre, la descripción, el precio y la foto del plato.");
  const options = validateOptions(data?.customization ?? []);

  await transaction(async (client) => {
    if (data?.id) {
      const result = await client.query(
        "UPDATE dishes SET name=$3,description=$4,price_cents=$5,image_url=$6,image_alt=$7,active=$8 WHERE kitchen_id=$1 AND id=$2 RETURNING id",
        [
          kitchenId,
          id,
          name,
          description,
          priceCents,
          data.imageUrl,
          imageAlt || name,
          data.active !== false,
        ],
      );

      if (!result.rowCount) fail("Plato no encontrado.", 404);
    } else
      await client.query(
        "INSERT INTO dishes(kitchen_id,id,name,description,price_cents,image_url,image_alt,active) VALUES ($1,$2,$3,$4,$5,$6,$7,true)",
        [
          kitchenId,
          id,
          name,
          description,
          priceCents,
          data.imageUrl,
          imageAlt || name,
        ],
      );
    await replaceOptions(client, "dish", kitchenId, id, options);
  });

  return id;
}

export async function saveOffer(kitchenId, data) {
  const id = data?.id || randomUUID();

  if (!validDate(data?.date) || data.date < todayLima())
    fail("Solo puedes editar menús de hoy o de fechas futuras.");
  const offerDay = new Date(`${data.date}T12:00:00Z`).getUTCDay();

  if (offerDay === 0) fail("Los domingos no forman parte del menú semanal.");
  const monday = new Date(`${todayLima()}T12:00:00Z`);

  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const end = new Date(monday);

  end.setUTCDate(end.getUTCDate() + 14);

  if (data.date >= end.toISOString().slice(0, 10))
    fail("Publica en esta semana o la siguiente.");

  if (
    !validTime(data.deliveryTime) ||
    !validTime(data.pickupUntil) ||
    data.pickupUntil <= data.deliveryTime
  )
    fail("Revisa la ventana de recojo.");
  const [startHour, startMinute] = data.deliveryTime.split(":").map(Number);
  const [endHour, endMinute] = data.pickupUntil.split(":").map(Number);

  if (endHour * 60 + endMinute - (startHour * 60 + startMinute) > 60)
    fail("La ventana de recojo puede durar como máximo 1 hora.");
  const legacyEndMinutes = Math.min(
    endHour * 60 + endMinute,
    startHour * 60 + startMinute + 10,
  );
  const legacyPickupUntil = `${String(Math.floor(legacyEndMinutes / 60)).padStart(2, "0")}:${String(legacyEndMinutes % 60).padStart(2, "0")}`;
  const extendedPickupUntil = data.pickupUntil === legacyPickupUntil ? null : data.pickupUntil;
  const deadline = new Date(data.bookingDeadline);
  const pickup = new Date(`${data.date}T${data.deliveryTime}:00-05:00`);
  const capacity = Number(data.capacity);

  if (
    !Number.isFinite(deadline.getTime()) ||
    deadline >= pickup ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > 10000
  )
    fail("Revisa el cierre de reserva y las porciones.");

  if (!data.id && (deadline <= new Date() || pickup <= new Date()))
    fail("El recojo y el cierre de reserva deben estar en el futuro.");
  const description =
    data.descriptionOverride == null || data.descriptionOverride === ""
      ? null
      : text(data.descriptionOverride, 90);
  const priceCents =
    data.priceSoles == null || data.priceSoles === ""
      ? null
      : soles(data.priceSoles);

  if (
    description?.length > 90 ||
    (priceCents !== null &&
      (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000))
  )
    fail("Revisa las modificaciones del menú.");
  const groups = data.hasCustomizationOverride
    ? validateOptions(data.customization ?? [])
    : null;

  try {
    await transaction(async (client) => {
      const dish = await client.query(
        "SELECT id,active FROM dishes WHERE kitchen_id=$1 AND id=$2",
        [kitchenId, data.dishId],
      );

      if (!dish.rows[0]?.active) fail("Elige un plato activo de tu cocina.");

      if (data.id) {
        const existing = await client.query(
          `SELECT offer_date AS date,reserved_count AS reserved,dish_id AS "dishId",delivery_time AS "deliveryTime",COALESCE(pickup_until_extended,pickup_until) AS "pickupUntil" FROM offers WHERE kitchen_id=$1 AND id=$2`,
          [kitchenId, id],
        );

        if (!existing.rows[0]) fail("Menú no encontrado.", 404);

        if (existing.rows[0].date < todayLima())
          fail("No puedes editar un menú pasado.", 403);

        if (capacity < existing.rows[0].reserved)
          fail(
            "Las porciones no pueden ser menos que las reservas confirmadas.",
          );

        if (
          existing.rows[0].reserved > 0 &&
          (existing.rows[0].date !== data.date ||
            existing.rows[0].dishId !== data.dishId ||
            existing.rows[0].deliveryTime !== data.deliveryTime ||
            existing.rows[0].pickupUntil !== data.pickupUntil)
        )
          fail(
            "Este menú ya tiene reservas. Conserva su plato, día y ventana de recojo.",
          );
        await client.query(
          `UPDATE offers SET dish_id=$3,offer_date=$4,delivery_time=$5,pickup_until=$6,booking_deadline_at=$7,capacity=$8,description_override=$9,price_override_cents=$10,customization_override=$11,pickup_until_extended=$12,sold_out_at=CASE WHEN reserved_count >= $8 THEN sold_out_at ELSE NULL END WHERE kitchen_id=$1 AND id=$2`,
          [
            kitchenId,
            id,
            data.dishId,
            data.date,
            data.deliveryTime,
            legacyPickupUntil,
            deadline,
            capacity,
            description,
            priceCents,
            Boolean(groups),
            extendedPickupUntil,
          ],
        );
      } else
        await client.query(
          `INSERT INTO offers(id,kitchen_id,dish_id,offer_date,delivery_time,pickup_until,booking_deadline_at,capacity,description_override,price_override_cents,customization_override,pickup_until_extended) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id,
            kitchenId,
            data.dishId,
            data.date,
            data.deliveryTime,
            legacyPickupUntil,
            deadline,
            capacity,
            description,
            priceCents,
            Boolean(groups),
            extendedPickupUntil,
          ],
        );
      await replaceOptions(client, "offer", kitchenId, id, groups || []);
    });
  } catch (cause) {
    if (String(cause.code).includes("CONSTRAINT_UNIQUE"))
      fail("Este plato ya está publicado para esa fecha y hora.", 409);
    throw cause;
  }

  return id;
}
