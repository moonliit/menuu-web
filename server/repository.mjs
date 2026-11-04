import { createHash, randomBytes, randomUUID } from "node:crypto";
import { deliveryMoment, weekStart } from "./catalog.mjs";
import { normalizeComment, selectCustomization } from "./customization.mjs";
import { getDb, transaction } from "./db.mjs";
import { releaseOrderCapacity } from "./reservation-lifecycle.mjs";

const soles = (cents) => cents / 100;
const cents = (solesValue) => Math.round(solesValue * 100);
const invalid = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const dishKey = (kitchenId, dishId) => `${kitchenId}:${dishId}`;

async function loadDishes(client, selection = null) {
  const filter = (alias) =>
    selection
      ? ` WHERE EXISTS (SELECT 1 FROM offers o WHERE o.kitchen_id=${alias}.kitchen_id AND o.dish_id=${alias}.${alias === "d" ? "id" : "dish_id"} AND ${selection.offerIds ? "o.id=ANY($1::text[])" : "o.offer_date >= $1 AND o.offer_date < date($1, '+14 days')"})`
      : "";
  const args = selection ? [selection.offerIds ?? selection.start] : [];
  const dishesResult = await client.query(
    `SELECT d.kitchen_id AS "kitchenId", d.id, d.name, d.description, d.price_cents AS "priceCents", d.image_url AS "imageUrl", d.image_alt AS "imageAlt", d.active FROM dishes d${filter("d")}`,
    args,
  );
  const groupsResult = await client.query(
    `SELECT g.kitchen_id AS "kitchenId", g.dish_id AS "dishId", g.id, g.title, g.selection_type AS "selectionType", g.required, g.max_selections AS "maxSelections" FROM option_groups g${filter("g")} ORDER BY g.sort_order,g.id`,
    args,
  );
  const choicesResult = await client.query(
    `SELECT c.kitchen_id AS "kitchenId", c.dish_id AS "dishId", c.group_id AS "groupId", c.id, c.label, c.price_cents AS "priceCents" FROM option_choices c${filter("c")} ORDER BY c.sort_order,c.id`,
    args,
  );
  const dishes = new Map(
    dishesResult.rows.map((row) => [
      dishKey(row.kitchenId, row.id),
      { ...row, priceSoles: soles(row.priceCents), customization: [] },
    ]),
  );
  const groups = new Map();

  for (const row of groupsResult.rows) {
    const dish = dishes.get(dishKey(row.kitchenId, row.dishId));

    if (!dish) continue;
    const group = {
      id: row.id,
      title: row.title,
      selectionType: row.selectionType,
      required: row.required,
      maxSelections: row.maxSelections,
      choices: [],
    };

    dish.customization.push(group);
    groups.set(`${row.kitchenId}:${row.dishId}:${row.id}`, group);
  }
  for (const row of choicesResult.rows)
    groups.get(`${row.kitchenId}:${row.dishId}:${row.groupId}`)?.choices.push({
      id: row.id,
      label: row.label,
      priceSoles: soles(row.priceCents),
    });

  return dishes;
}

async function loadOfferOptions(client, ids) {
  if (!ids.length) return new Map();
  const [groupsResult, choicesResult] = await Promise.all([
    client.query(
      'SELECT offer_id AS "offerId",id,title,selection_type AS "selectionType",required,max_selections AS "maxSelections" FROM offer_option_groups WHERE offer_id=ANY($1::text[]) ORDER BY sort_order,id',
      [ids],
    ),
    client.query(
      'SELECT offer_id AS "offerId",group_id AS "groupId",id,label,price_cents AS "priceCents" FROM offer_option_choices WHERE offer_id=ANY($1::text[]) ORDER BY sort_order,id',
      [ids],
    ),
  ]);
  const offers = new Map(),
    groups = new Map();

  for (const row of groupsResult.rows) {
    if (!offers.has(row.offerId)) offers.set(row.offerId, []);
    const group = {
      id: row.id,
      title: row.title,
      selectionType: row.selectionType,
      required: row.required,
      maxSelections: row.maxSelections,
      choices: [],
    };

    offers.get(row.offerId).push(group);
    groups.set(`${row.offerId}:${row.id}`, group);
  }
  for (const row of choicesResult.rows)
    groups.get(`${row.offerId}:${row.groupId}`)?.choices.push({
      id: row.id,
      label: row.label,
      priceSoles: soles(row.priceCents),
    });

  return offers;
}

export async function getCatalog(now = new Date()) {
  const start = weekStart(now);
  const [
    kitchensResult,
    offersResult,
    dishes,
    salesResult,
    weeklyDishSalesResult,
    ratingsResult,
  ] = await Promise.all([
    getDb().query(
      'SELECT id, name, description, image_url AS "imageUrl", logo_url AS "logoUrl" FROM kitchens ORDER BY name',
    ),
    getDb().query(
      `SELECT id, kitchen_id AS "kitchenId", dish_id AS "dishId", offer_date AS date,
      delivery_time AS "deliveryTime", COALESCE(pickup_until_extended,pickup_until) AS "pickupUntil",
      booking_deadline_at AS "bookingDeadline", booking_deadline_at > $2 AS "withinBookingWindow",
      capacity, reserved_count AS "reservedCount", sort_order AS "sortOrder",description_override AS "descriptionOverride",price_override_cents AS "priceOverrideCents",customization_override AS "customizationOverride"
      FROM offers WHERE offer_date >= $1 AND offer_date < date($1, '+14 days') ORDER BY offer_date, sort_order, id`,
      [start, now.toISOString()],
    ),
    loadDishes(getDb(), { start }),
    getDb()
      .query(`SELECT f.kitchen_id AS "kitchenId", f.dish_id AS "dishId", sum(i.quantity) AS units
      FROM order_items i JOIN orders o ON o.id=i.order_id JOIN offers f ON f.id=i.offer_id
      WHERE o.status='reservado' AND o.fulfillment_status='delivered'
        AND (o.payment_checkout_id IS NULL OR EXISTS(SELECT 1 FROM payment_checkouts p WHERE p.id=o.payment_checkout_id AND p.status='approved'))
      GROUP BY f.kitchen_id,f.dish_id ORDER BY units DESC, f.kitchen_id,f.dish_id`),
    getDb().query(
      `SELECT CASE WHEN f.offer_date < date($1, '+7 days') THEN 0 ELSE 1 END AS week,
      f.kitchen_id AS "kitchenId", f.dish_id AS "dishId", sum(i.quantity) AS units,
      count(DISTINCT o.id) AS "orderCount"
      FROM order_items i JOIN orders o ON o.id=i.order_id JOIN offers f ON f.id=i.offer_id
      WHERE f.offer_date >= $1 AND f.offer_date < date($1, '+14 days')
        AND o.status='reservado' AND o.fulfillment_status <> 'no_show'
        AND (o.payment_checkout_id IS NULL OR EXISTS(SELECT 1 FROM payment_checkouts p WHERE p.id=o.payment_checkout_id AND p.status='approved'))
      GROUP BY week, f.kitchen_id, f.dish_id
      ORDER BY week, units DESC, "orderCount" DESC, f.kitchen_id, f.dish_id`,
      [start],
    ),
    getDb()
      .query(`SELECT o.kitchen_id AS "kitchenId", round(avg(r.kitchen_rating),1) AS rating,
      count(DISTINCT o.user_id) AS "ratingCount"
      FROM order_reviews r JOIN orders o ON o.id=r.order_id
      WHERE o.status='reservado' AND o.fulfillment_status='delivered' AND r.banned_at IS NULL GROUP BY o.kitchen_id`),
  ]);
  const kitchenNames = new Map(
    kitchensResult.rows.map((kitchen) => [kitchen.id, kitchen.name]),
  );
  const offerOptions = await loadOfferOptions(
    getDb(),
    offersResult.rows
      .filter((row) => row.customizationOverride)
      .map((row) => row.id),
  );
  const kitchenRatings = new Map(
    ratingsResult.rows.map((row) => [row.kitchenId, row]),
  );
  const nextStart = new Date(`${start}T12:00:00Z`);

  nextStart.setUTCDate(nextStart.getUTCDate() + 7);
  const next = nextStart.toISOString().slice(0, 10);

  return {
    kitchens: kitchensResult.rows.map((kitchen) => ({
      ...kitchen,
      rating: kitchenRatings.get(kitchen.id)?.rating ?? null,
      ratingCount: kitchenRatings.get(kitchen.id)?.ratingCount ?? 0,
    })),
    sales: salesResult.rows,
    weeklyDishSales: weeklyDishSalesResult.rows,
    weeks: [start, next],
    offerings: offersResult.rows.flatMap((row) => {
      const dish = dishes.get(dishKey(row.kitchenId, row.dishId));

      if (!dish) return [];
      const remaining = row.capacity - row.reservedCount;
      const {
        withinBookingWindow,
        descriptionOverride,
        priceOverrideCents,
        customizationOverride,
        ...offer
      } = row;

      return [
        {
          ...dish,
          ...offer,
          description: descriptionOverride ?? dish.description,
          priceCents: priceOverrideCents ?? dish.priceCents,
          priceSoles: soles(priceOverrideCents ?? dish.priceCents),
          customization: customizationOverride
            ? offerOptions.get(row.id) || []
            : dish.customization,
          kitchenName: kitchenNames.get(row.kitchenId) || "",
          remaining,
          bookable: remaining > 0 && withinBookingWindow,
          week: row.date >= next ? 1 : 0,
        },
      ];
    }),
  };
}

export async function findUserByEmail(email) {
  const result = await getDb().query(
    `SELECT u.id,u.name,u.email,u.role,u.kitchen_id AS "kitchenId",u.student_code AS "studentCode",u.career,u.birth_date AS "birthDate",u.password_hash AS "passwordHash",u.google_sub AS "googleSub",
    NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.status='reservado' AND o.fulfillment_status='no_show') AS "bookingAllowed"
    FROM users u WHERE u.email=$1`,
    [email],
  );

  return result.rows[0] || null;
}

export async function findUserByGoogleSub(googleSub) {
  const result = await getDb().query(
    `SELECT u.id,u.name,u.email,u.role,u.kitchen_id AS "kitchenId",u.student_code AS "studentCode",u.career,u.birth_date AS "birthDate",u.password_hash AS "passwordHash",u.google_sub AS "googleSub",
    NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.status='reservado' AND o.fulfillment_status='no_show') AS "bookingAllowed"
    FROM users u WHERE u.google_sub=$1`,
    [googleSub],
  );

  return result.rows[0] || null;
}

export async function linkGoogleSub(userId, googleSub) {
  await getDb().query(
    "UPDATE users SET google_sub=$2 WHERE id=$1 AND google_sub IS NULL",
    [userId, googleSub],
  );
}

export async function insertUser(user) {
  const result = await getDb().query(
    `INSERT INTO users (id,name,email,password_hash,role,student_code,career,birth_date,google_sub)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id,name,email,role,kitchen_id AS "kitchenId",student_code AS "studentCode",career,
      birth_date AS "birthDate",1 AS "bookingAllowed"`,
    [
      user.id,
      user.name,
      user.email,
      user.passwordHash,
      user.role,
      user.studentCode,
      user.career,
      user.birthDate || null,
      user.googleSub || null,
    ],
  );

  return result.rows[0];
}

export async function userFromSession(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await getDb().query(
    `SELECT u.id,u.name,u.email,u.role,u.kitchen_id AS "kitchenId",u.student_code AS "studentCode",u.career,u.birth_date AS "birthDate",
    NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id=u.id AND o.status='reservado' AND o.fulfillment_status='no_show') AS "bookingAllowed"
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2`,
    [tokenHash(token), new Date().toISOString()],
  );

  return result.rows[0] || null;
}

export async function updateConsumerProfile(
  userId,
  { name, studentCode, career, birthDate },
) {
  const result = await getDb().query(
    `UPDATE users SET name=$2,student_code=$3,career=$4,birth_date=$5
    WHERE id=$1 AND role='consumer' RETURNING id`,
    [userId, name, studentCode, career, birthDate],
  );

  return result.rowCount > 0;
}

export async function insertSession(token, userId) {
  await getDb().query(
    "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)",
    [
      tokenHash(token),
      userId,
      new Date(Date.now() + 7 * 86400_000).toISOString(),
    ],
  );
}

export async function removeSession(token) {
  if (token && /^[a-f0-9]{64}$/.test(token))
    await getDb().query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash(token),
    ]);
}

export async function cancelOrder(userId, orderId) {
  return transaction(async (db) => {
    const order = (await db.query(
      `SELECT id,kitchen_id AS "kitchenId",payment_checkout_id AS "paymentCheckoutId",offer_date AS date,delivery_time AS "deliveryTime",status,
       fulfillment_status AS "fulfillmentStatus" FROM orders WHERE id=$1 AND user_id=$2`,
        [orderId, userId],
      )
    ).rows[0];

    if (!order) throw invalid("Reserva no encontrada.", 404);
    if (order.paymentCheckoutId) throw invalid("Para cancelar una reserva con Yape, contacta a Menúu para coordinar la devolución.", 409);
    if (order.status !== "reservado" || order.fulfillmentStatus !== "pending")
      throw invalid("Esta reserva ya no se puede cancelar.", 409);

    if (deliveryMoment(order.date, order.deliveryTime).getTime() <= Date.now())
      throw invalid("La hora de recojo ya comenzó. Contacta a la cocina.", 409);
    const changed = await db.query(
      `UPDATE orders SET status='cancelado',review_enabled=0,cancelled_at=$3
       WHERE id=$1 AND user_id=$2 AND status='reservado' AND fulfillment_status='pending' RETURNING id`,
      [orderId, userId, new Date().toISOString()],
    );

    if (!changed.rowCount)
      throw invalid("Esta reserva ya no se puede cancelar.", 409);
    await releaseOrderCapacity(db, orderId, order.kitchenId);

    return { ok: true };
  });
}

export async function getOrders(userId, page = null) {
  const paged = page !== null;
  const ordersResult = await getDb().query(
    `SELECT o.id,o.code,o.kitchen_id AS "kitchenId",o.kitchen_name AS "kitchenName",
    o.offer_date AS date,o.delivery_time AS "deliveryTime",
    o.pickup_until AS "pickupUntil",o.pickup_point AS "pickupPoint",o.status,COALESCE(o.payment_recorded,o.payment) AS payment,
    o.payment_checkout_id AS "paymentCheckoutId",p.status AS "paymentStatus",p.expires_at AS "paymentExpiresAt",p.review_note AS "paymentReviewNote",p.amount_cents AS "paymentAmountCents",
    o.fulfillment_status AS "fulfillmentStatus",o.review_enabled AS "reviewEnabled",r.kitchen_rating AS "kitchenRating",r.comment AS "kitchenComment",
    o.total_cents AS "totalCents",o.created_at AS "createdAt" FROM orders o
    LEFT JOIN order_reviews r ON r.order_id=o.id
    LEFT JOIN payment_checkouts p ON p.id=o.payment_checkout_id
    WHERE o.user_id=$1 ORDER BY o.created_at DESC,o.id DESC${paged ? " LIMIT $2 OFFSET $3" : ""}`,
    paged ? [userId, page.limit, page.offset] : [userId],
  );

  if (!ordersResult.rows.length) return [];
  const ids = ordersResult.rows.map((row) => row.id);
  const [itemsResult, choicesResult] = await Promise.all([
    getDb().query(
      `SELECT i.id,i.order_id AS "orderId",i.offer_id AS "offeringId",i.dish_name AS name,i.image_url AS "imageUrl",
      i.quantity,i.comment,i.unit_price_cents AS "unitPriceCents",i.total_cents AS "totalCents",r.food_rating AS "foodRating"
      FROM order_items i LEFT JOIN order_item_reviews r ON r.order_item_id=i.id
      WHERE i.order_id=ANY($1::text[]) ORDER BY i.sort_order,i.id`,
      [ids],
    ),
    getDb().query(
      `SELECT c.order_item_id AS "itemId",c.group_id AS "groupId",c.group_title AS title,
      c.choice_id AS "choiceId",c.choice_label AS label,c.price_cents AS "priceCents"
      FROM order_item_choices c JOIN order_items i ON i.id=c.order_item_id
      WHERE i.order_id=ANY($1::text[]) ORDER BY c.sort_order,c.choice_id`,
      [ids],
    ),
  ]);
  const choices = new Map();

  for (const row of choicesResult.rows) {
    if (!choices.has(row.itemId)) choices.set(row.itemId, []);
    choices.get(row.itemId).push({
      groupId: row.groupId,
      title: row.title,
      choiceId: row.choiceId,
      label: row.label,
      priceSoles: soles(row.priceCents),
    });
  }
  const items = new Map();

  for (const row of itemsResult.rows) {
    if (!items.has(row.orderId)) items.set(row.orderId, []);
    items.get(row.orderId).push({
      id: row.id,
      offeringId: row.offeringId,
      name: row.name,
      imageUrl: row.imageUrl,
      quantity: row.quantity,
      comment: row.comment,
      choices: choices.get(row.id) || [],
      unitPriceSoles: soles(row.unitPriceCents),
      totalSoles: soles(row.totalCents),
      foodRating: row.foodRating,
    });
  }

  return ordersResult.rows.map((row) => ({
    id: row.id,
    code: row.code,
    kitchenName: row.kitchenName,
    date: row.date,
    deliveryTime: row.deliveryTime,
    pickupUntil: row.pickupUntil,
    pickupPoint: row.pickupPoint,
    status: row.status,
    payment: row.payment,
    paymentCheckoutId: row.paymentCheckoutId,
    paymentStatus: row.paymentStatus,
    paymentExpiresAt: row.paymentExpiresAt,
    paymentReviewNote: row.paymentReviewNote,
    paymentAmountSoles: row.paymentAmountCents === null ? null : soles(row.paymentAmountCents),
    fulfillmentStatus: row.fulfillmentStatus,
    reviewEnabled: row.reviewEnabled,
    kitchenRating: row.kitchenRating,
    kitchenComment: row.kitchenComment,
    totalSoles: soles(row.totalCents),
    createdAt: row.createdAt,
    items: items.get(row.id) || [],
  }));
}

export async function getOrdersPage(userId, { limit = 10, offset = 0 } = {}) {
  const [orders, count] = await Promise.all([
    getOrders(userId, { limit, offset }),
    getDb().query("SELECT count(*) AS total FROM orders WHERE user_id=$1", [
      userId,
    ]),
  ]);

  return { orders, total: Number(count.rows[0].total), limit, offset };
}

export async function submitReview(userId, orderId, payload) {
  const kitchenRating = Number(payload?.kitchenRating);
  const comment = typeof payload?.comment === "string"
    ? payload.comment.trim().replace(/\s+/g, " ")
    : "";

  if (
    !Number.isInteger(kitchenRating) ||
    kitchenRating < 1 ||
    kitchenRating > 5
  )
    throw invalid("Califica la cocina de 1 a 5 estrellas.");

  if (!comment || comment.length > 100 || /[\u0000-\u001f\u007f]/.test(comment))
    throw invalid("Escribe un comentario de hasta 100 caracteres.");

  return transaction(async (client) => {
    const orderResult = await client.query(
      `SELECT id,status,fulfillment_status AS "fulfillmentStatus",review_enabled AS "reviewEnabled"
      FROM orders WHERE id=$1 AND user_id=$2`,
      [orderId, userId],
    );
    const order = orderResult.rows[0];

    if (!order) throw invalid("Pedido no encontrado.", 404);

    if (
      order.status !== "reservado" ||
      order.fulfillmentStatus !== "delivered" ||
      !order.reviewEnabled
    )
      throw invalid("Este pedido aún no está habilitado para reseñas.", 403);

    if (
      (
        await client.query("SELECT 1 FROM order_reviews WHERE order_id=$1", [
          orderId,
        ])
      ).rowCount
    )
      throw invalid("Ya calificaste este pedido.", 409);
    await client.query(
      "INSERT INTO order_reviews (order_id,kitchen_rating,comment) VALUES ($1,$2,$3)",
      [orderId, kitchenRating, comment],
    );

    return { ok: true };
  });
}

export async function createBooking(userId, payload, requestKey = null) {
  if (!Array.isArray(payload) || payload.length < 1 || payload.length > 20)
    throw invalid("Agrega al menos un plato al carrito.");

  if (
    payload.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        typeof item.offeringId !== "string" ||
        !item.offeringId,
    )
  )
    throw invalid("Hay un plato inválido en el carrito.");

  if (
    requestKey !== null &&
    (typeof requestKey !== "string" ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(requestKey))
  )
    throw invalid("Identificador de solicitud inválido.");

  return transaction(async (client) => {
    if (requestKey) {
      const payloadHash = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
      const claimed = await client.query(
        `INSERT INTO booking_requests (user_id,request_key,payload_hash)
        VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING request_key`,
        [userId, requestKey, payloadHash],
      );

      if (!claimed.rowCount) {
        const existing = await client.query(
          "SELECT payload_hash,response FROM booking_requests WHERE user_id=$1 AND request_key=$2",
          [userId, requestKey],
        );

        if (existing.rows[0]?.payload_hash !== payloadHash)
          throw invalid("La solicitud ya se usó con otro carrito.", 409);

        if (!existing.rows[0]?.response)
          throw invalid(
            "La reserva sigue en proceso. Intenta nuevamente.",
            409,
          );

        return JSON.parse(existing.rows[0].response);
      }
    }

    if (
      (
        await client.query(
          "SELECT 1 FROM orders WHERE user_id=$1 AND status='reservado' AND fulfillment_status='no_show' LIMIT 1",
          [userId],
        )
      ).rowCount
    ) {
      throw invalid(
        "No puedes confirmar otra reserva mientras tengas un pedido marcado como no recogido.",
        403,
      );
    }
    const ids = [...new Set(payload.map((item) => item.offeringId))].sort();
    const offersResult = await client.query(
      `SELECT id,kitchen_id AS "kitchenId",dish_id AS "dishId",
      offer_date AS date,delivery_time AS "deliveryTime",
      COALESCE(pickup_until_extended,pickup_until) AS "pickupUntil",booking_deadline_at AS "bookingDeadline",
      booking_deadline_at > $2 AS "withinBookingWindow",capacity,reserved_count AS "reservedCount",price_override_cents AS "priceOverrideCents",customization_override AS "customizationOverride"
      FROM offers WHERE id=ANY($1::text[]) ORDER BY id`,
      [ids, new Date().toISOString()],
    );
    const offers = new Map(offersResult.rows.map((row) => [row.id, row]));
    const offerOptions = await loadOfferOptions(
      client,
      offersResult.rows
        .filter((row) => row.customizationOverride)
        .map((row) => row.id),
    );
    const dishes = await loadDishes(client, { offerIds: ids });
    const kitchensResult = await client.query("SELECT id,name FROM kitchens");
    const kitchenNames = new Map(
      kitchensResult.rows.map((row) => [row.id, row.name]),
    );
    const requested = new Map();
    const items = payload.map((item) => {
      const offer = offers.get(item.offeringId);

      if (!offer || !offer.withinBookingWindow)
        throw invalid(
          "El plazo de reserva de uno de los platos ya terminó.",
          409,
        );
      const quantity = Number(item.quantity);

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10)
        throw invalid("La cantidad debe estar entre 1 y 10.");
      requested.set(offer.id, (requested.get(offer.id) || 0) + quantity);

      if (offer.reservedCount + requested.get(offer.id) > offer.capacity)
        throw invalid(
          `Ya no quedan suficientes porciones de ${dishes.get(dishKey(offer.kitchenId, offer.dishId))?.name || "este plato"}.`,
          409,
        );
      const dish = dishes.get(dishKey(offer.kitchenId, offer.dishId));

      if (!dish) throw invalid("Uno de los menús ya no está disponible.", 409);
      const selections = selectCustomization(
        offer.customizationOverride
          ? offerOptions.get(offer.id) || []
          : dish.customization,
        item.choices,
      );
      const comment = normalizeComment(item.comment);
      const unitPriceCents =
        (offer.priceOverrideCents ?? dish.priceCents) +
        selections.reduce((sum, choice) => sum + cents(choice.priceSoles), 0);

      return {
        offeringId: offer.id,
        name: dish.name,
        imageUrl: dish.imageUrl,
        quantity,
        comment,
        choices: selections,
        unitPriceCents,
        totalCents: unitPriceCents * quantity,
        kitchenId: offer.kitchenId,
        kitchenName: kitchenNames.get(offer.kitchenId) || "",
        bookingDeadline: offer.bookingDeadline,
        date: offer.date,
        deliveryTime: offer.deliveryTime,
        pickupUntil: offer.pickupUntil,
      };
    });

    for (const id of ids) {
      const reserved = await client.query(
        `UPDATE offers SET reserved_count=reserved_count+$2,sold_out_at=CASE WHEN reserved_count+$2=capacity THEN $3 ELSE sold_out_at END WHERE id=$1
        AND reserved_count+$2<=capacity AND booking_deadline_at>$3 RETURNING id`,
        [id, requested.get(id), new Date().toISOString()],
      );

      if (!reserved.rowCount)
        throw invalid(
          "El plazo de reserva terminó o se agotaron las porciones de uno de los platos.",
          409,
        );
    }
    const groups = new Map();

    for (const item of items) {
      const key = `${item.kitchenId}:${item.date}:${item.deliveryTime}`;

      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const checkoutId = randomUUID();
    const checkoutAmount = items.reduce((sum, item) => sum + item.totalCents, 0);
    if (checkoutAmount <= 0) throw invalid("El total del pedido debe ser mayor que cero.");
    const paymentExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await client.query(
      "INSERT INTO payment_checkouts(id,user_id,amount_cents,status,expires_at) VALUES($1,$2,$3,'awaiting_proof',$4)",
      [checkoutId, userId, checkoutAmount, paymentExpiresAt],
    );
    const created = [];

    for (const group of groups.values()) {
      const order = {
        id: randomUUID(),
        code: `MU-${randomBytes(4).toString("hex").toUpperCase()}`,
        userId,
        kitchenId: group[0].kitchenId,
        kitchenName: group[0].kitchenName,
        date: group[0].date,
        deliveryTime: group[0].deliveryTime,
        pickupUntil: group[0].pickupUntil,
        pickupPoint: "Entrada del Comedor UTEC en piso 2",
        status: "reservado",
        payment: "Yape anticipado",
        paymentCheckoutId: checkoutId,
        paymentStatus: "awaiting_proof",
        paymentExpiresAt,
        totalCents: group.reduce((sum, item) => sum + item.totalCents, 0),
        createdAt: new Date().toISOString(),
      };

      await client.query(
        `INSERT INTO orders (id,code,user_id,kitchen_id,kitchen_name,offer_date,delivery_time,pickup_until,pickup_point,status,payment,total_cents,created_at,payment_checkout_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          order.id,
          order.code,
          userId,
          order.kitchenId,
          order.kitchenName,
          order.date,
          order.deliveryTime,
          order.pickupUntil,
          order.pickupPoint,
          order.status,
          order.payment,
          order.totalCents,
          order.createdAt,
          checkoutId,
        ],
      );
      const visibleItems = [];

      for (const [index, item] of group.entries()) {
        const saved = await client.query(
          `INSERT INTO order_items (order_id,offer_id,dish_name,image_url,quantity,comment,unit_price_cents,total_cents,sort_order,booking_deadline_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            order.id,
            item.offeringId,
            item.name,
            item.imageUrl,
            item.quantity,
            item.comment,
            item.unitPriceCents,
            item.totalCents,
            index,
            item.bookingDeadline,
          ],
        );

        for (const [choiceIndex, choice] of item.choices.entries()) {
          await client.query(
            `INSERT INTO order_item_choices (order_item_id,group_id,group_title,choice_id,choice_label,price_cents,sort_order)
            VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              saved.rows[0].id,
              choice.groupId,
              choice.title,
              choice.choiceId,
              choice.label,
              cents(choice.priceSoles),
              choiceIndex,
            ],
          );
        }
        visibleItems.push({
          offeringId: item.offeringId,
          name: item.name,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
          comment: item.comment,
          choices: item.choices,
          unitPriceSoles: soles(item.unitPriceCents),
          totalSoles: soles(item.totalCents),
        });
      }
      created.push({
        id: order.id,
        code: order.code,
        kitchenName: order.kitchenName,
        date: order.date,
        deliveryTime: order.deliveryTime,
        pickupUntil: order.pickupUntil,
        pickupPoint: order.pickupPoint,
        status: order.status,
        payment: order.payment,
        paymentCheckoutId: checkoutId,
        paymentStatus: "awaiting_proof",
        paymentExpiresAt,
        totalSoles: soles(order.totalCents),
        createdAt: order.createdAt,
        items: visibleItems,
      });
    }

    if (requestKey)
      await client.query(
        "UPDATE booking_requests SET response=$3 WHERE user_id=$1 AND request_key=$2",
        [userId, requestKey, JSON.stringify(created)],
      );

    return created;
  });
}
