import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createClient } from "@libsql/client";

if (!process.env.MENUU_TEST_DB_PATH) {
  const directory = await mkdtemp(join(tmpdir(), "menuu-libsql-"));

  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
        stdio: "inherit",
        env: {
          ...process.env,
          MENUU_TEST_DB_PATH: join(directory, "consumer.db"),
        },
      });

      child.on("error", reject);
      child.on("exit", (value) => resolve(value || 0));
    });

    if (code) process.exitCode = code;

    if (!code) {
      const adminDbUrl = `file:${join(directory, "fresh-admin.db")}`;
      const adminCode = await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [fileURLToPath(new URL("./create-admin.mjs", import.meta.url))],
          {
            stdio: "inherit",
            env: {
              ...process.env,
              MENUU_ADMIN_DATABASE_URL: adminDbUrl,
              MENUU_ADMIN_EMAIL: "admin-fresh@menuu.test",
              MENUU_ADMIN_PASSWORD: "clave-admin-temporal-123",
            },
          },
        );

        child.on("error", reject);
        child.on("exit", (value) => resolve(value || 0));
      });

      assert.equal(adminCode, 0);
      const freshDb = createClient({ url: adminDbUrl });

      try {
        const admin = await freshDb.execute(
          "SELECT role,kitchen_id FROM users WHERE email='admin-fresh@menuu.test'",
        );

        assert.equal(admin.rows[0].role, "admin");
        assert.equal(admin.rows[0].kitchen_id, null);
      } finally {
        await freshDb.close();
      }
    }
  } finally {
    if (
      !resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`) ||
      !basename(directory).startsWith("menuu-libsql-")
    )
      throw new Error("Ruta temporal inesperada.");
    await rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
} else {
  process.env.TURSO_DATABASE_URL = `file:${process.env.MENUU_TEST_DB_PATH}`;
  delete process.env.TURSO_AUTH_TOKEN;

  const { migrate } = await import("./migrate.mjs");
  const { closeDb, getDb } = await import("../server/db.mjs");
  const { weekStart } = await import("../server/catalog.mjs");
  const { hashPassword } = await import("../server/store.mjs");
  const {
    cancelOrder,
    createBooking,
    findUserByGoogleSub,
    getCatalog,
    getOrders,
    insertSession,
    insertUser,
    linkGoogleSub,
    submitReview,
  } = await import("../server/repository.mjs");
  const { kitchenData, kitchenImage, saveDish, saveKitchenImage, saveOffer } =
    await import("../server/kitchen.mjs");
  const {
    addExtraPortion,
    addKitchenReservation,
    kitchenStudentCandidates,
    updateKitchenReservation,
  } = await import("../server/kitchen.mjs");
  const { handleRequest } = await import("../server/index.mjs");
  const { dispatchPickupReminders, savePushSubscription, validDispatchSecret } = await import("../server/push.mjs");
  const { submitPaymentProof, reviewPayment, pendingPayments, expireUnpaidCheckouts, paymentProof } = await import("../server/payments.mjs");
  const { adminReviews, markReviewPromptSeen, moderateReview, pendingReviewPrompt, recentKitchenReviews } = await import("../server/reviews.mjs");

  try {
    const migrationDb = getDb();

    await migrationDb.query(
      "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    );
    const initialSql = await readFile(
      fileURLToPath(
        new URL("../server/migrations/0001_initial.sql", import.meta.url),
      ),
      "utf8",
    );

    for (const statement of initialSql
      .split(/;\s*(?:\r?\n|$)/)
      .map((value) => value.trim())
      .filter(Boolean))
      await migrationDb.query(statement);
    await migrationDb.query(
      "INSERT INTO schema_migrations(name) VALUES ('0001_initial.sql')",
    );
    await migrationDb.query(
      "INSERT INTO users(id,name,email,password_hash,role,student_code,career) VALUES ('before-migration','Estudiante anterior','anterior@utec.edu.pe','hash','consumer','800000001','Ingeniería')",
    );
    await migrationDb.query(
      "INSERT INTO kitchens(id,name) VALUES ('old-kitchen','Cocina anterior')",
    );
    await migrationDb.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES ('old-session','before-migration','2099-01-01')",
    );
    await migrationDb.query(
      "INSERT INTO orders(id,code,user_id,kitchen_id,kitchen_name,offer_date,delivery_time,pickup_until,pickup_point,status,payment,total_cents) VALUES ('old-order','MU-OLD','before-migration','old-kitchen','Cocina anterior','2020-01-01','13:00','13:10','Comedor UTEC','reservado','QR al recibir',1100)",
    );
    await migrationDb.query(
      "INSERT INTO dishes(kitchen_id,id,name,price_cents) VALUES ('old-kitchen','old-dish','Plato anterior',1100)",
    );
    await migrationDb.query(
      "INSERT INTO offers(id,kitchen_id,dish_id,offer_date,delivery_time,pickup_until,booking_deadline_at,capacity,reserved_count,sold_out_at) VALUES ('old-offer','old-kitchen','old-dish','2020-01-01','13:00','13:10','2020-01-01T12:00:00-05:00',1,1,'2020-01-01T12:00:00Z')",
    );
    await migrationDb.query(
      "INSERT INTO orders(id,code,user_id,kitchen_id,kitchen_name,offer_date,delivery_time,pickup_until,pickup_point,status,payment,total_cents,fulfillment_status) VALUES ('old-no-show','MU-NOSHOW','before-migration','old-kitchen','Cocina anterior','2020-01-01','13:00','13:10','Comedor UTEC','reservado','QR al recibir',1100,'no_show')",
    );
    await migrationDb.query(
      "INSERT INTO order_items(order_id,offer_id,dish_name,quantity,unit_price_cents,total_cents) VALUES ('old-no-show','old-offer','Plato anterior',1,1100,1100)",
    );
    await migrate();
    await migrate();
    const db = getDb();

    assert.equal(
      (
        await db.query(
          "SELECT user_id FROM sessions WHERE token_hash='old-session'",
        )
      ).rows[0].user_id,
      "before-migration",
    );
    assert.equal((await db.query("PRAGMA foreign_key_check")).rows.length, 0);
    assert.equal(
      (await db.query("SELECT pickup_point FROM orders WHERE id='old-order'"))
        .rows[0].pickup_point,
      "Entrada del Comedor UTEC en piso 2",
    );
    const reconciled = (
      await db.query(
        "SELECT reserved_count,sold_out_at FROM offers WHERE id='old-offer'",
      )
    ).rows[0];

    assert.equal(reconciled.reserved_count, 0);
    assert.equal(reconciled.sold_out_at, null);

    await db.query(
      "INSERT INTO kitchens(id,name,description) VALUES ($1,$2,$3)",
      ["test-kitchen", "Cocina temporal", "Para probar reservas"],
    );
    const consumers = [0, 1].map((index) => ({
      id: randomUUID(),
      name: `Estudiante ${index}`,
      email: `temporal${index}@utec.edu.pe`,
      passwordHash: hashPassword("clave-para-test"),
      role: "consumer",
      studentCode: `90000000${index}`,
      career: "Ciencia de la Computación",
      birthDate: null,
    }));

    for (const consumer of consumers) await insertUser(consumer);
    await linkGoogleSub(consumers[0].id, "google-sub-0");
    assert.equal(
      (await findUserByGoogleSub("google-sub-0")).id,
      consumers[0].id,
    );
    const dishId = await saveDish("test-kitchen", {
      name: "Almuerzo temporal",
      description: "Con arroz.",
      priceSoles: 11,
      imageUrl: "/images/menuu-logo.png",
      customization: [],
    });
    const date = new Date(`${weekStart()}T12:00:00Z`);

    date.setUTCDate(date.getUTCDate() + 7);
    const offerDate = date.toISOString().slice(0, 10);
    const offerId = await saveOffer("test-kitchen", {
      dishId,
      date: offerDate,
      deliveryTime: "13:00",
      pickupUntil: "13:10",
      bookingDeadline: `${offerDate}T12:00:00-05:00`,
      capacity: 1,
    });
    const catalog = await getCatalog();

    assert.equal(catalog.offerings.length, 1);
    assert.equal(catalog.offerings[0].bookable, true);
    const first = await createBooking(
      consumers[0].id,
      [{ offeringId: offerId, quantity: 1, choices: {}, comment: "Sin ají" }],
      "request-test-001",
    );

    assert.equal(first.length, 1);
    assert.equal(first[0].paymentStatus, "awaiting_proof");
    await db.query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES('payment-reviewer','Revisor de pagos','pagos@menuu.test','hash','admin')",
    );
    await submitPaymentProof(
      consumers[0].id,
      first[0].paymentCheckoutId,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=", "base64"),
      "image/png",
    );
    assert.equal((await pendingPayments()).length, 1);
    assert.equal((await paymentProof(first[0].paymentCheckoutId, { id: consumers[0].id, role: "consumer" })).mime, "image/png");
    await assert.rejects(paymentProof(first[0].paymentCheckoutId, { id: consumers[1].id, role: "consumer" }), { status: 404 });
    await assert.rejects(
      reviewPayment(first[0].paymentCheckoutId, "payment-reviewer", "rejected"),
      { status: 400 },
    );
    await reviewPayment(first[0].paymentCheckoutId, "payment-reviewer", "approved");
    assert.equal((await getOrders(consumers[0].id))[0].paymentStatus, "approved");
    assert.deepEqual(
      await createBooking(
        consumers[0].id,
        [{ offeringId: offerId, quantity: 1, choices: {}, comment: "Sin ají" }],
        "request-test-001",
      ),
      first,
    );
    await assert.rejects(
      () =>
        createBooking(
          consumers[1].id,
          [{ offeringId: offerId, quantity: 1, choices: {} }],
          "request-test-002",
        ),
      { status: 409 },
    );
    assert.equal((await getCatalog()).offerings[0].remaining, 0);
    assert.equal((await getOrders(consumers[0].id)).length, 1);
    const previousVapid = [
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
      process.env.VAPID_SUBJECT,
      process.env.CRON_SECRET,
    ];

    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    process.env.VAPID_SUBJECT = "mailto:avisos@example.com";
    process.env.CRON_SECRET = "test-secret-at-least-24-characters";
    assert.equal(
      validDispatchSecret(`Bearer ${process.env.CRON_SECRET}`),
      true,
    );
    assert.equal(validDispatchSecret("Bearer wrong-secret"), false);
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/test-device",
      keys: { p256dh: "A".repeat(88), auth: "B".repeat(22) },
    };

    await savePushSubscription(consumers[0].id, subscription);
    const reminderTime = new Date(`${offerDate}T12:55:15-05:00`);
    const pushed = [];

    assert.equal(
      (
        await dispatchPickupReminders(reminderTime, async (target, payload) => {
          pushed.push({ target, payload: JSON.parse(payload) });
        })
      ).sent,
      1,
    );
    assert.equal(pushed[0].target.endpoint, subscription.endpoint);
    assert.match(pushed[0].payload.body, /5 minutos/);
    assert.equal(
      (
        await dispatchPickupReminders(reminderTime, async () =>
          pushed.push("duplicate"),
        )
      ).sent,
      0,
    );
    assert.equal(pushed.length, 1);
    [
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
      "CRON_SECRET",
    ].forEach((name, index) => {
      if (previousVapid[index] === undefined) delete process.env[name];
      else process.env[name] = previousVapid[index];
    });
    const secondDate = new Date(`${offerDate}T12:00:00Z`);

    secondDate.setUTCDate(secondDate.getUTCDate() + 1);
    const nextDay = secondDate.toISOString().slice(0, 10);
    const concurrentOffer = await saveOffer("test-kitchen", {
      dishId,
      date: nextDay,
      deliveryTime: "13:00",
      pickupUntil: "13:10",
      bookingDeadline: `${nextDay}T12:00:00-05:00`,
      capacity: 1,
    });
    const simultaneous = await Promise.allSettled(
      consumers.map((consumer, index) =>
        createBooking(
          consumer.id,
          [{ offeringId: concurrentOffer, quantity: 1, choices: {} }],
          `parallel-${index}-request`,
        ),
      ),
    );

    assert.equal(
      simultaneous.filter((outcome) => outcome.status === "fulfilled").length,
      1,
    );
    assert.equal(
      simultaneous.filter(
        (outcome) =>
          outcome.status === "rejected" && outcome.reason.status === 409,
      ).length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT reserved_count AS reserved FROM offers WHERE id=$1",
          [concurrentOffer],
        )
      ).rows[0].reserved,
      1,
    );
    const concurrent = simultaneous.find((outcome) => outcome.status === "fulfilled").value[0];
    const concurrentOwner = (await db.query("SELECT user_id AS id FROM orders WHERE id=$1", [concurrent.id])).rows[0].id;
    await submitPaymentProof(concurrentOwner, concurrent.paymentCheckoutId,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=", "base64"), "image/png");
    await reviewPayment(concurrent.paymentCheckoutId, "payment-reviewer", "approved");
    const data = await kitchenData("test-kitchen");

    assert.equal(data.analytics.totalOrders, 2);
    assert.equal(data.offers[0].reservedCount, 1);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRj0AAAAASUVORK5CYII=",
      "base64",
    );
    const imageUrl = await saveKitchenImage("test-kitchen", png, "image/png");

    assert.deepEqual(
      Buffer.from((await kitchenImage(imageUrl.split("/").at(-1))).content),
      png,
    );
    const order = (await getOrders(consumers[0].id)).find(
      (value) => value.id === first[0].id,
    );

    await db.query(
      "UPDATE orders SET fulfillment_status=$2,review_enabled=$3 WHERE id=$1",
      [order.id, "delivered", true],
    );
    assert.equal((await pendingReviewPrompt(consumers[0].id)).orderId, order.id);
    await markReviewPromptSeen(consumers[0].id, order.id);
    assert.equal(await pendingReviewPrompt(consumers[0].id), null);
    await submitReview(
      consumers[0].id,
      order.id,
      {
        kitchenRating: 5,
        comment: "Muy rico el almuerzo.",
      },
    );
    await assert.rejects(submitReview(consumers[0].id, order.id, {
      kitchenRating: 5, comment: "x".repeat(101),
    }), /100 caracteres/);
    assert.equal(
      (await getCatalog()).kitchens.find((item) => item.id === "test-kitchen")
        .rating,
      5,
    );
    const publicReviews = await recentKitchenReviews("test-kitchen");
    assert.equal(publicReviews.reviews[0].comment, "Muy rico el almuerzo.");
    assert.equal(publicReviews.reviews[0].items[0].name, order.items[0].name);
    assert.equal((await adminReviews()).reviews[0].orderId, order.id);
    await moderateReview(order.id, "payment-reviewer", "ban");
    assert.equal((await getCatalog()).kitchens.find((item) => item.id === "test-kitchen").rating, null);
    assert.equal((await recentKitchenReviews("test-kitchen")).reviews.length, 0);
    assert.equal((await adminReviews({ status: "visible" })).total, 0);
    assert.equal((await adminReviews({ status: "banned" })).reviews[0].orderId, order.id);
    await moderateReview(order.id, "payment-reviewer", "restore");
    assert.equal((await getCatalog()).kitchens.find((item) => item.id === "test-kitchen").rating, 5);
    assert.deepEqual((await db.query("SELECT action FROM review_moderation_events WHERE order_id=$1 ORDER BY created_at,rowid", [order.id])).rows.map((row) => row.action), ["ban", "restore"]);
    const server = createServer(handleRequest);

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const registered = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Nueva estudiante",
          email: "nueva@utec.edu.pe",
          password: "clave-segura",
          studentCode: "900000002",
          career: "Ciencia de la Computación",
        }),
      });

      assert.equal(registered.status, 403);

      const consumerToken = "c".repeat(64);

      await insertSession(consumerToken, consumers[0].id);
      const cookie = `menuu_session=${consumerToken}`;
      const bootstrap = await fetch(`${base}/api/bootstrap`, {
        headers: { Cookie: cookie },
      });

      assert.equal(bootstrap.status, 200);
      assert.equal(
        (await bootstrap.json()).user.email,
        "temporal0@utec.edu.pe",
      );
      // Las requests sin un credential real de Google se rechazan.
      const googleNew = await fetch(`${base}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alumno.google@utec.edu.pe",
          name: "Alumno Google",
        }),
      });

      assert.equal(googleNew.status, 401);
      for (let attempt = 0; attempt < 9; attempt += 1) {
        const response = await fetch(`${base}/api/auth/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        assert.equal(response.status, 401);
      }
      const rateLimitedGoogle = await fetch(`${base}/api/auth/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      assert.equal(rateLimitedGoogle.status, 429);
      assert.ok(Number(rateLimitedGoogle.headers.get("retry-after")) >= 1);

      const sessionResponse = await fetch(`${base}/api/session`, {
        headers: { Cookie: cookie },
      });

      assert.equal(
        (await sessionResponse.json()).user.email,
        "temporal0@utec.edu.pe",
      );
      assert.equal((await fetch(`${base}/api/push/dispatch`)).status, 401);
      const catalogResponse = await fetch(`${base}/api/catalog`);

      assert.equal(catalogResponse.status, 200);
      assert.match(catalogResponse.headers.get("cache-control"), /s-maxage=30/);
      assert.equal((await catalogResponse.json()).offerings.length, 2);
      assert.equal((await fetch(`${base}/api/orders`)).status, 401);
      assert.equal(
        (
          await fetch(`${base}/api/orders?limit=0`, {
            headers: { Cookie: cookie },
          })
        ).status,
        400,
      );
      const ordersPageResponse = await fetch(
        `${base}/api/orders?limit=1&offset=0`,
        {
          headers: { Cookie: `menuu_session=${consumerToken}` },
        },
      );
      const ordersPage = await ordersPageResponse.json();

      assert.equal(ordersPageResponse.status, 200);
      assert.equal(ordersPage.orders.length, 1);
      assert.ok(ordersPage.total >= 1);

      const preUsers = [
        ["pre@utec.edu.pe", "Estudiante PRE", "1234PRE5612345"],
        ["prelargo@utec.edu.pe", "Estudiante PRE largo", "5678PRE90123456"],
        ["preletras@utec.edu.pe", "Estudiante PRE letras", "20261PREEN01008"],
      ];

      for (const [email, name, studentCode] of preUsers)
        await insertUser({
          id: randomUUID(),
          name,
          email,
          passwordHash: hashPassword("clave-segura"),
          role: "consumer",
          studentCode,
          career: "Ciencia de la Computación",
          birthDate: null,
        });

      const preToken = "d".repeat(64);
      const preUser = (
        await db.query("SELECT id FROM users WHERE email='pre@utec.edu.pe'")
      ).rows[0];

      await insertSession(preToken, preUser.id);

      const preRegistered = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Estudiante PRE",
          email: "pre@utec.edu.pe",
          password: "clave-segura",
          studentCode: "1234pre5612345",
          career: "Ciencia de la Computación",
        }),
      });

      assert.equal(preRegistered.status, 403);
      const preLongRegistered = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Estudiante PRE largo",
          email: "prelargo@utec.edu.pe",
          password: "clave-segura",
          studentCode: "5678pre90123456",
          career: "Ciencia de la Computación",
        }),
      });

      assert.equal(preLongRegistered.status, 403);
      const preLettersRegistered = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Estudiante PRE letras",
          email: "preletras@utec.edu.pe",
          password: "clave-segura",
          studentCode: "20261preen01008",
          career: "Ciencia de la Computación",
        }),
      });

      assert.equal(preLettersRegistered.status, 403);
      const preUpdated = await fetch(`${base}/api/account/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `menuu_session=${preToken}; menuu_csrf=test-csrf`,
          "X-CSRF-Token": "test-csrf",
        },
        body: JSON.stringify({
          name: "Estudiante PRE",
          studentCode: "1234PRE56123456",
          career: "Ciencia de la Computación",
        }),
      });

      assert.equal(preUpdated.status, 200);
      assert.equal(
        (await preUpdated.json()).user.studentCode,
        "1234PRE56123456",
      );
      const csrfRejected = await fetch(`${base}/api/account/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `menuu_session=${preToken}; menuu_csrf=test-csrf`,
        },
        body: JSON.stringify({
          name: "Sin CSRF",
          studentCode: "1234PRE56123456",
          career: "Ciencia de la Computación",
        }),
      });

      assert.equal(csrfRejected.status, 403);
      const invalidPre = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Código inválido",
          email: "invalido@utec.edu.pe",
          password: "clave-segura",
          studentCode: "1234PREX612345",
          career: "Ciencia de la Computación",
        }),
      });

      assert.equal(invalidPre.status, 403);

      await db.query(
        "INSERT INTO users(id,name,email,password_hash,role,kitchen_id) VALUES ('kitchen-actor','Cocina temporal','cocina@menuu.test','hash','kitchen','test-kitchen')",
      );
      await db.query(
        "INSERT INTO users(id,name,email,password_hash,role) VALUES ('admin-actor','Admin temporal','admin@menuu.test',$1,'admin')",
        [hashPassword("admin-test-password")],
      );
      const adminToken = "b".repeat(64);

      await insertSession(adminToken, "admin-actor");
      const adminCookie = `menuu_session=${adminToken}; menuu_csrf=test-csrf`;
      const adminHeaders = {
        Cookie: adminCookie,
        "Content-Type": "application/json",
        "X-CSRF-Token": "test-csrf",
      };
      const adminLogin = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@menuu.test",
          password: "admin-test-password",
          role: "admin",
        }),
      });

      assert.equal(adminLogin.status, 200);
      assert.equal((await adminLogin.json()).user.role, "admin");
      assert.equal((await fetch(`${base}/api/kitchens/test-kitchen/reviews`)).status, 200);
      assert.equal((await fetch(`${base}/api/admin/reviews`)).status, 401);
      assert.equal((await fetch(`${base}/api/admin/reviews`, { headers: { Cookie: adminCookie } })).status, 200);
      assert.equal((await fetch(`${base}/api/admin/data`)).status, 401);
      assert.equal(
        (await fetch(`${base}/api/admin/data`, { headers: { Cookie: cookie } }))
          .status,
        403,
      );
      assert.equal(
        (
          await fetch(`${base}/api/kitchen/data`, {
            headers: { Cookie: adminCookie },
          })
        ).status,
        401,
      );
      await db.query(
        "INSERT INTO kitchens(id,name) VALUES ('second-kitchen','Segunda cocina')",
      );
      const secondDish = await saveDish("second-kitchen", {
        name: "Segundo almuerzo",
        priceSoles: 12,
        imageUrl: "/images/menuu-logo.png",
        customization: [],
      });
      const secondOffer = await saveOffer("second-kitchen", {
        dishId: secondDish,
        date: offerDate,
        deliveryTime: "14:00",
        pickupUntil: "14:10",
        bookingDeadline: `${offerDate}T13:00:00-05:00`,
        capacity: 2,
      });
      const allOffers = await fetch(`${base}/api/admin/data`, {
        headers: { Cookie: adminCookie },
      });

      assert.equal(allOffers.status, 200);
      const allAdminData = await allOffers.json();

      assert.deepEqual(
        new Set(allAdminData.offers.map((item) => item.kitchenId)),
        new Set(["test-kitchen", "second-kitchen"]),
      );
      const adminPageResponse = await fetch(
        `${base}/api/admin/data?week=1&limit=1&offset=0`,
        {
          headers: { Cookie: adminCookie },
        },
      );
      const adminPage = await adminPageResponse.json();

      assert.equal(adminPageResponse.status, 200);
      assert.equal(adminPage.offers.length, 1);
      assert.ok(adminPage.totalOffers >= 2);
      assert.equal(adminPage.kitchens.length, 2);
      assert.equal(
        (await kitchenData("test-kitchen")).offers.some(
          (item) => item.id === secondOffer,
        ),
        false,
      );
      const beforeStudent = await fetch(
        `${base}/api/admin/offers/${secondOffer}/students?q=fresh%40`,
        { headers: { Cookie: adminCookie } },
      );

      assert.deepEqual((await beforeStudent.json()).students, []);
      const freshRegistration = await fetch(`${base}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Estudiante reciente",
          email: "fresh@utec.edu.pe",
          password: "clave-segura",
          studentCode: "900000003",
          career: "Ciencia de la Computación",
        }),
      });

      assert.equal(freshRegistration.status, 403);
      await insertUser({
        id: randomUUID(),
        name: "Estudiante reciente",
        email: "fresh@utec.edu.pe",
        passwordHash: hashPassword("clave-segura"),
        role: "consumer",
        studentCode: "900000003",
        career: "Ciencia de la Computación",
        birthDate: null,
      });
      const freshUser = (
        await db.query("SELECT id FROM users WHERE email='fresh@utec.edu.pe'")
      ).rows[0];
      const afterStudent = await fetch(
        `${base}/api/admin/offers/${secondOffer}/students?q=fresh%40`,
        { headers: { Cookie: adminCookie } },
      );
      const candidatePage = await afterStudent.json();

      assert.equal(candidatePage.students[0].id, freshUser.id);
      assert.equal(candidatePage.total, 1);
      assert.equal(
        (
          await kitchenStudentCandidates("test-kitchen", offerId, "fresh@")
        ).some((item) => item.id === freshUser.id),
        true,
      );
      const restoredSession = await fetch(`${base}/api/admin/data`, {
        headers: { Cookie: `menuu_session=${adminToken}` },
      });
      assert.equal(restoredSession.status, 200);
      const restoredCsrf = /menuu_csrf=([^;]+)/.exec(
        restoredSession.headers.get("set-cookie") || "",
      )?.[1];
      assert.ok(restoredCsrf, "Una sesión anterior debe recibir un token CSRF");
      const proxyHeaders = {
        Cookie: `menuu_session=${adminToken}; menuu_csrf=${restoredCsrf}`,
        "Content-Type": "application/json",
        "X-CSRF-Token": restoredCsrf,
        Origin: "https://menuu.example",
        Host: "internal.example",
        "Sec-Fetch-Site": "same-origin",
      };
      const proxyWrite = await fetch(`${base}/api/admin/offers/capacity`, {
        method: "POST",
        headers: proxyHeaders,
        body: JSON.stringify({ offerId: secondOffer, capacity: 2 }),
      });
      assert.equal(proxyWrite.status, 200);
      const crossSiteWrite = await fetch(`${base}/api/admin/offers/capacity`, {
        method: "POST",
        headers: { ...proxyHeaders, "Sec-Fetch-Site": "cross-site" },
        body: JSON.stringify({ offerId: secondOffer, capacity: 2 }),
      });
      assert.equal(crossSiteWrite.status, 403);
      const changedCapacity = await fetch(`${base}/api/admin/offers/capacity`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ offerId: secondOffer, capacity: 3 }),
      });

      assert.equal(changedCapacity.status, 200);
      assert.equal(
        (
          await db.query(
            "SELECT actor_user_id AS actor,previous_capacity AS previous,new_capacity AS next FROM admin_offer_events WHERE offer_id=$1",
            [secondOffer],
          )
        ).rows[0].actor,
        "admin-actor",
      );
      const adminAdded = await fetch(`${base}/api/admin/reservations/add`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          offerId: secondOffer,
          studentId: freshUser.id,
          quantity: 1,
        }),
      });

      assert.equal(adminAdded.status, 201);
      const adminOrderId = (await adminAdded.json()).orderId;
      const secondAdminAdd = await fetch(`${base}/api/admin/reservations/add`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          offerId: secondOffer,
          studentId: preUser.id,
          quantity: 1,
        }),
      });

      assert.equal(secondAdminAdd.status, 201);
      const invalidCapacity = await fetch(`${base}/api/admin/offers/capacity`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ offerId: secondOffer, capacity: 1 }),
      });

      assert.equal(invalidCapacity.status, 409);
      const adminDelivered = await fetch(
        `${base}/api/admin/reservations/update`,
        {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({
            orderId: adminOrderId,
            action: "deliver",
            orderItemId: (
              await db.query("SELECT id FROM order_items WHERE order_id=$1", [
                adminOrderId,
              ])
            ).rows[0].id,
            deliveredQuantity: 1,
            paymentMethod: "QR",
            deliveredAt: "2024-01-02T13:05",
          }),
        },
      );

      assert.equal(adminDelivered.status, 200);
      assert.equal((await getOrders(freshUser.id)).find((item) => item.id === adminOrderId).reviewEnabled, true);
      assert.equal((await pendingReviewPrompt(freshUser.id)).orderId, adminOrderId);
      assert.equal(
        (
          await db.query("SELECT delivered_at FROM orders WHERE id=$1", [
            adminOrderId,
          ])
        ).rows[0].delivered_at,
        "2024-01-02T18:05:00.000Z",
      );
      assert.equal(
        (
          await db.query(
            "SELECT actor_user_id AS actor FROM kitchen_reservation_events WHERE order_id=$1 AND action='deliver'",
            [adminOrderId],
          )
        ).rows[0].actor,
        "admin-actor",
      );
      await db.query("UPDATE offers SET capacity=2 WHERE id=$1", [offerId]);
      const candidates = await kitchenStudentCandidates(
        "test-kitchen",
        offerId,
        "pre@",
      );

      assert.equal(
        candidates.some((student) => student.id === preUser.id),
        true,
      );
      await assert.rejects(
        kitchenStudentCandidates("another-kitchen", offerId, "pre@"),
        { status: 404 },
      );
      const manual = await addKitchenReservation(
        "test-kitchen",
        "kitchen-actor",
        {
          offerId,
          studentId: preUser.id,
          quantity: 1,
        },
      );
      const manualReservation = (
        await kitchenData("test-kitchen")
      ).reservations.find((item) => item.orderId === manual.orderId);

      assert.equal(
        manualReservation.bookingDeadlineAt,
        (
          await db.query(
            "SELECT booking_deadline_at AS deadline FROM offers WHERE id=$1",
            [offerId],
          )
        ).rows[0].deadline,
      );
      assert.equal(
        (await kitchenStudentCandidates("test-kitchen", offerId, "pre@")).some(
          (student) => student.id === preUser.id && student.alreadyAdded,
        ),
        true,
      );
      assert.equal(
        (
          await db.query("SELECT reserved_count FROM offers WHERE id=$1", [
            offerId,
          ])
        ).rows[0].reserved_count,
        2,
      );
      await assert.rejects(
        updateKitchenReservation("test-kitchen", "kitchen-actor", {
          orderId: manual.orderId,
          action: "confirm",
        }),
        /Cambio de reserva inválido/,
      );
      await assert.rejects(
        updateKitchenReservation("test-kitchen", "kitchen-actor", {
          orderId: manual.orderId,
          action: "payment",
          paymentMethod: "Efectivo",
        }),
        { status: 409 },
      );
      await updateKitchenReservation("test-kitchen", "admin-actor", {
        orderId: manual.orderId,
        orderItemId: manual.orderItemId,
        action: "deliver",
        deliveredQuantity: 1,
        paymentMethod: "Efectivo",
      });
      const manualOrder = (await getOrders(preUser.id)).find(
        (order) => order.id === manual.orderId,
      );

      assert.equal(
        (await kitchenData("test-kitchen")).reservations.some(
          (item) =>
            item.orderId === manual.orderId &&
            item.studentEmail === "pre@utec.edu.pe",
        ),
        true,
      );
      await assert.rejects(
        updateKitchenReservation("another-kitchen", "kitchen-actor", {
          orderId: manual.orderId,
          action: "reset",
        }),
        { status: 404 },
      );
      assert.equal(manualOrder.fulfillmentStatus, "delivered");
      assert.equal(manualOrder.payment, "Efectivo");
      const ordinaryCreatedAt = (
        await db.query("SELECT created_at FROM orders WHERE id=$1", [
          manual.orderId,
        ])
      ).rows[0].created_at;

      await assert.rejects(
        updateKitchenReservation("test-kitchen", "kitchen-actor", {
          orderId: manual.orderId,
          orderItemId: manual.orderItemId,
          action: "deliver",
          deliveredQuantity: 1,
          paymentMethod: "Efectivo",
          deliveredAt: "2024-01-02T13:05",
        }),
        { status: 403 },
      );
      await updateKitchenReservation(
        "test-kitchen",
        "kitchen-actor",
        {
          orderId: manual.orderId,
          orderItemId: manual.orderItemId,
          action: "deliver",
          deliveredQuantity: 1,
          paymentMethod: "Efectivo",
          deliveredAt: "2024-01-02T13:05",
        },
        true,
      );
      assert.deepEqual(
        (
          await db.query(
            'SELECT created_at AS "createdAt",delivered_at AS "deliveredAt" FROM orders WHERE id=$1',
            [manual.orderId],
          )
        ).rows[0],
        {
          createdAt: ordinaryCreatedAt,
          deliveredAt: "2024-01-02T18:05:00.000Z",
        },
      );
      await assert.rejects(
        updateKitchenReservation("test-kitchen", "kitchen-actor", {
          orderId: manual.orderId,
          orderItemId: manual.orderItemId,
          action: "deliver",
          deliveredQuantity: 2,
          paymentMethod: "QR",
        }),
        { status: 409 },
      );
      await assert.rejects(
        updateKitchenReservation("test-kitchen", "kitchen-actor", {
          orderId: manual.orderId,
          orderItemId: manual.orderItemId,
          action: "deliver",
          deliveredQuantity: 0,
          paymentMethod: "QR",
        }),
        { status: 400 },
      );
      await db.query("UPDATE offers SET capacity=3 WHERE id=$1", [offerId]);
      await updateKitchenReservation("test-kitchen", "kitchen-actor", {
        orderId: manual.orderId,
        orderItemId: manual.orderItemId,
        action: "deliver",
        deliveredQuantity: 2,
        paymentMethod: "QR",
      });
      assert.equal(
        (
          await db.query("SELECT reserved_count FROM offers WHERE id=$1", [
            offerId,
          ])
        ).rows[0].reserved_count,
        3,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT quantity,delivered_quantity AS deliveredQuantity FROM order_items WHERE id=$1",
            [manual.orderItemId],
          )
        ).rows[0],
        { quantity: 1, deliveredQuantity: 2 },
      );
      await updateKitchenReservation("test-kitchen", "kitchen-actor", {
        orderId: manual.orderId,
        orderItemId: manual.orderItemId,
        action: "deliver",
        deliveredQuantity: 1,
        paymentMethod: "Efectivo",
      });
      await db.query("UPDATE offers SET capacity=2 WHERE id=$1", [offerId]);
      assert.equal(
        manualOrder.pickupPoint,
        "Entrada del Comedor UTEC en piso 2",
      );
      await updateKitchenReservation("test-kitchen", "kitchen-actor", {
        orderId: first[0].id,
        action: "reset",
      });
      await assert.rejects(
        updateKitchenReservation("test-kitchen", "kitchen-actor", {
          orderId: first[0].id,
          action: "cancel",
        }),
        /Espera hasta que termine/,
      );
      await db.query(
        "UPDATE orders SET offer_date='2020-01-01',pickup_until='13:10',created_at='2020-01-01T12:00:00Z',pickup_confirmed=1 WHERE id=$1",
        [first[0].id],
      );
      await updateKitchenReservation("test-kitchen", "kitchen-actor", {
        orderId: first[0].id,
        action: "cancel",
      });
      assert.equal(
        (await getOrders(consumers[0].id)).find(
          (order) => order.id === first[0].id,
        ).fulfillmentStatus,
        "no_show",
      );
      const releasedStock = (
        await db.query(
          "SELECT reserved_count,sold_out_at FROM offers WHERE id=$1",
          [offerId],
        )
      ).rows[0];

      assert.equal(releasedStock.reserved_count, 1);
      assert.equal(releasedStock.sold_out_at, null);
      const preLongUser = (
        await db.query(
          "SELECT id FROM users WHERE email='prelargo@utec.edu.pe'",
        )
      ).rows[0];

      await addKitchenReservation("test-kitchen", "kitchen-actor", {
        offerId,
        studentId: preLongUser.id,
        quantity: 1,
      });
      await assert.rejects(
        updateKitchenReservation("test-kitchen", "kitchen-actor", {
          orderId: first[0].id,
          action: "reset",
        }),
        /No hay cupo para restaurar/,
      );
      await db.query("UPDATE offers SET capacity=3 WHERE id=$1", [offerId]);
      await updateKitchenReservation("test-kitchen", "kitchen-actor", {
        orderId: first[0].id,
        action: "reset",
      });
      assert.equal(
        (
          await db.query("SELECT reserved_count FROM offers WHERE id=$1", [
            offerId,
          ])
        ).rows[0].reserved_count,
        3,
      );
      assert.equal(
        (await getOrders(consumers[0].id)).find(
          (order) => order.id === first[0].id,
        ).fulfillmentStatus,
        "pending",
      );
      await db.query(
        "UPDATE offers SET offer_date='2020-01-01',booking_deadline_at='2020-01-01T12:00:00-05:00',capacity=4 WHERE id=$1",
        [offerId],
      );
      const extraordinary = await addKitchenReservation(
        "test-kitchen",
        "kitchen-actor",
        { offerId, studentId: consumers[1].id, quantity: 1 },
      );
      const extraordinaryOrder = (await getOrders(consumers[1].id)).find(
        (order) => order.id === extraordinary.orderId,
      );

      assert.equal(extraordinary.extraordinary, true);
      assert.equal(extraordinaryOrder.fulfillmentStatus, "delivered");
      assert.equal(
        (
          await db.query("SELECT delivered_at FROM orders WHERE id=$1", [
            extraordinary.orderId,
          ])
        ).rows[0].delivered_at,
        extraordinaryOrder.createdAt,
      );
      assert.ok(
        new Date(extraordinaryOrder.createdAt).getTime() >
          new Date(
            (
              await db.query(
                "SELECT booking_deadline_at AS deadline FROM order_items WHERE id=$1",
                [extraordinary.orderItemId],
              )
            ).rows[0].deadline,
          ).getTime(),
      );
      assert.equal(
        (
          await db.query(
            "SELECT delivered_quantity FROM order_items WHERE id=$1",
            [extraordinary.orderItemId],
          )
        ).rows[0].delivered_quantity,
        1,
      );
      assert.ok(
        new Date(extraordinaryOrder.createdAt).getTime() >
          new Date("2020-01-01T13:10:00-05:00").getTime(),
      );
      assert.equal(
        (
          await db.query(
            "SELECT action FROM kitchen_reservation_events WHERE order_id=$1",
            [extraordinary.orderId],
          )
        ).rows[0].action,
        "manual_add",
      );
      await assert.rejects(
        updateKitchenReservation(
          "test-kitchen",
          "admin-actor",
          {
            orderId: extraordinary.orderId,
            orderItemId: extraordinary.orderItemId,
            action: "deliver",
            deliveredQuantity: 1,
            paymentMethod: "Efectivo",
            deliveredAt: "2020-01-01T13:09",
          },
          true,
        ),
        /no puede ser anterior al fin de recojo/,
      );
      await updateKitchenReservation(
        "test-kitchen",
        "admin-actor",
        {
          orderId: extraordinary.orderId,
          orderItemId: extraordinary.orderItemId,
          action: "deliver",
          deliveredQuantity: 1,
          paymentMethod: "Efectivo",
          deliveredAt: "2020-01-01T13:20",
        },
        true,
      );
      assert.deepEqual(
        (
          await db.query(
            'SELECT created_at AS "createdAt",delivered_at AS "deliveredAt" FROM orders WHERE id=$1',
            [extraordinary.orderId],
          )
        ).rows[0],
        {
          createdAt: "2020-01-01T18:20:00.000Z",
          deliveredAt: "2020-01-01T18:20:00.000Z",
        },
      );
      await assert.rejects(
        updateKitchenReservation("test-kitchen", "kitchen-actor", {
          orderId: extraordinary.orderId,
          action: "cancel",
        }),
        /extraordinaria posterior al recojo/,
      );
      await db.query(
        "INSERT INTO offers(id,kitchen_id,dish_id,offer_date,delivery_time,pickup_until,booking_deadline_at,capacity,reserved_count) VALUES('cancel-offer','test-kitchen',$1,'2099-01-01','13:00','13:10','2098-12-31T13:00:00-05:00',1,1)",
        [dishId],
      );
      await db.query(
        "INSERT INTO orders(id,code,user_id,kitchen_id,kitchen_name,offer_date,delivery_time,pickup_until,pickup_point,status,payment,total_cents) VALUES('cancel-order','MU-CANCEL',$1,'test-kitchen','Cocina','2099-01-01','13:00','13:10','Entrada del Comedor UTEC en piso 2','reservado','QR al recibir',1100)",
        [consumers[1].id],
      );
      await db.query(
        "INSERT INTO order_items(order_id,offer_id,dish_name,quantity,unit_price_cents,total_cents) VALUES('cancel-order','cancel-offer','Plato',1,1100,1100)",
      );
      await assert.rejects(cancelOrder(consumers[0].id, "cancel-order"), {
        status: 404,
      });
      await cancelOrder(consumers[1].id, "cancel-order");
      assert.equal(
        (
          await db.query(
            "SELECT reserved_count FROM offers WHERE id='cancel-offer'",
          )
        ).rows[0].reserved_count,
        0,
      );
      assert.equal(
        (await getOrders(consumers[1].id)).find(
          (order) => order.id === "cancel-order",
        ).status,
        "cancelado",
      );
      assert.equal(
        (await kitchenStudentCandidates("test-kitchen", "cancel-offer")).some(
          (student) => student.id === consumers[1].id,
        ),
        true,
      );
      await assert.rejects(cancelOrder(consumers[1].id, "cancel-order"), {
        status: 409,
      });
      await db.query(
        "INSERT INTO offers(id,kitchen_id,dish_id,offer_date,delivery_time,pickup_until,booking_deadline_at,capacity,reserved_count) VALUES('expired-offer','test-kitchen',$1,'2020-01-02','13:00','13:10','2020-01-02T12:00:00-05:00',1,1)",
        [dishId],
      );
      await db.query(
        "INSERT INTO orders(id,code,user_id,kitchen_id,kitchen_name,offer_date,delivery_time,pickup_until,pickup_point,status,payment,total_cents,created_at) VALUES('expired-order','MU-EXPIRED',$1,'test-kitchen','Cocina','2020-01-02','13:00','13:10','Entrada del Comedor UTEC en piso 2','reservado','QR al recibir',1100,'2020-01-02T17:00:00Z')",
        [consumers[1].id],
      );
      await db.query(
        "INSERT INTO order_items(order_id,offer_id,dish_name,quantity,unit_price_cents,total_cents) VALUES('expired-order','expired-offer','Plato',1,1100,1100)",
      );
      const afterPickup = await fetch(`${base}/api/bootstrap`);

      assert.equal(afterPickup.status, 200);
      assert.equal(
        (await getOrders(consumers[1].id)).find(
          (order) => order.id === "expired-order",
        ).fulfillmentStatus,
        "pending",
      );
      assert.equal(
        (
          await db.query(
            "SELECT reserved_count FROM offers WHERE id='expired-offer'",
          )
        ).rows[0].reserved_count,
        1,
      );
      await updateKitchenReservation("test-kitchen", "kitchen-actor", {
        orderId: "expired-order",
        action: "cancel",
      });
      assert.equal(
        (await getOrders(consumers[1].id)).find(
          (order) => order.id === "expired-order",
        ).fulfillmentStatus,
        "no_show",
      );
      assert.equal(
        (
          await db.query(
            "SELECT reserved_count FROM offers WHERE id='expired-offer'",
          )
        ).rows[0].reserved_count,
        0,
      );
      await updateKitchenReservation("test-kitchen", "kitchen-actor", {
        orderId: "expired-order",
        action: "reset",
      });
      const kitchenToken = "a".repeat(64);

      await insertSession(kitchenToken, "kitchen-actor");
      const updatedKitchenCandidates = await fetch(
        `${base}/api/kitchen/offers/${offerId}/students?q=fresh%40`,
        { headers: { Cookie: `menuu_session=${kitchenToken}` } },
      );

      assert.equal(
        (await updatedKitchenCandidates.json()).students.some(
          (student) => student.id === freshUser.id,
        ),
        true,
      );
      assert.equal(
        (
          await fetch(`${base}/api/admin/data`, {
            headers: { Cookie: `menuu_session=${kitchenToken}` },
          })
        ).status,
        403,
      );
      const kitchenAfterCorrection = await fetch(`${base}/api/kitchen/data`, {
        headers: { Cookie: `menuu_session=${kitchenToken}` },
      });

      assert.equal(kitchenAfterCorrection.status, 200);
      const kitchenCsrf = /menuu_csrf=([^;]+)/.exec(
        kitchenAfterCorrection.headers.get("set-cookie") || "",
      )?.[1];
      assert.ok(kitchenCsrf);
      const photoUpload = await fetch(`${base}/api/kitchen/photo?scope=dish`, {
        method: "POST",
        headers: {
          Cookie: `menuu_session=${kitchenToken}; menuu_csrf=${kitchenCsrf}`,
          "X-CSRF-Token": kitchenCsrf,
          "Content-Type": "image/png",
          Origin: "https://menuu.example",
          Host: "internal.example",
          "Sec-Fetch-Site": "same-origin",
        },
        body: png,
      });
      assert.equal(photoUpload.status, 200);
      assert.match((await photoUpload.json()).url, /^\/api\/kitchen\/image\//);
      const kitchenOperations = await fetch(
        `${base}/api/kitchen/data?scope=operations`,
        {
          headers: { Cookie: `menuu_session=${kitchenToken}` },
        },
      );

      assert.equal(kitchenOperations.status, 200);
      const operations = await kitchenOperations.json();

      assert.equal(operations.analytics, null);
      assert.ok(operations.offers.some((item) => item.id === concurrentOffer));
      const afterCorrection = await fetch(`${base}/api/bootstrap`);

      assert.equal(afterCorrection.status, 200);
      assert.equal(
        (await getOrders(consumers[1].id)).find(
          (order) => order.id === "expired-order",
        ).fulfillmentStatus,
        "pending",
      );
      assert.equal(
        (
          await db.query(
            "SELECT reserved_count FROM offers WHERE id='expired-offer'",
          )
        ).rows[0].reserved_count,
        1,
      );
      assert.deepEqual(
        (
          await db.query(
            "SELECT action FROM kitchen_reservation_events WHERE order_id='expired-order' ORDER BY rowid",
          )
        ).rows.map((event) => event.action),
        ["cancel", "reset"],
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    const extraDate = new Date(Date.parse(`${offerDate}T12:00:00Z`) + 2 * 86400_000).toISOString().slice(0, 10);
    const extraOffer = await saveOffer("test-kitchen", {
      dishId, date: extraDate, deliveryTime: "13:00", pickupUntil: "13:10",
      bookingDeadline: `${extraDate}T12:00:00-05:00`, capacity: 2,
    });
    const prepaid = (await createBooking(consumers[0].id,
      [{ offeringId: extraOffer, quantity: 1, choices: {} }], "extra-prepaid-test"))[0];
    await submitPaymentProof(consumers[0].id, prepaid.paymentCheckoutId,
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=", "base64"), "image/png");
    await reviewPayment(prepaid.paymentCheckoutId, "payment-reviewer", "approved");
    const prepaidItem = (await db.query("SELECT id FROM order_items WHERE order_id=$1", [prepaid.id])).rows[0];
    const extraSale = await addExtraPortion("test-kitchen", "kitchen-actor", {
      orderId: prepaid.id, orderItemId: prepaidItem.id, quantity: 1, paymentMethod: "Efectivo",
    }, new Date(`${extraDate}T13:05:00-05:00`));
    const extraSaved = (await db.query(
      "SELECT payment_recorded AS payment,payment_checkout_id AS checkout FROM orders WHERE id=$1", [extraSale.orderId],
    )).rows[0];
    assert.equal(extraSaved.payment, "Efectivo");
    assert.equal(extraSaved.checkout, null);
    assert.equal((await getOrders(consumers[0].id)).find((order) => order.id === prepaid.id).paymentStatus, "approved");
    assert.equal((await db.query("SELECT reserved_count AS count FROM offers WHERE id=$1", [extraOffer])).rows[0].count, 2);
    const expiryDate = new Date(Date.parse(`${offerDate}T12:00:00Z`) + 3 * 86400_000).toISOString().slice(0, 10);
    const expiryOffer = await saveOffer("test-kitchen", {
      dishId, date: expiryDate, deliveryTime: "13:00", pickupUntil: "13:10",
      bookingDeadline: `${expiryDate}T12:00:00-05:00`, capacity: 1,
    });
    const unpaid = (await createBooking(consumers[0].id,
      [{ offeringId: expiryOffer, quantity: 1, choices: {} }], "expiry-prepaid-test"))[0];
    await db.query("UPDATE payment_checkouts SET expires_at='2020-01-01T00:00:00Z' WHERE id=$1", [unpaid.paymentCheckoutId]);
    await expireUnpaidCheckouts();
    assert.equal((await db.query("SELECT reserved_count AS count FROM offers WHERE id=$1", [expiryOffer])).rows[0].count, 0);
    assert.equal((await getOrders(consumers[0].id)).find((order) => order.id === unpaid.id).paymentStatus, "expired");
    const hourOffer = await saveOffer("test-kitchen", {
      dishId, date: offerDate, deliveryTime: "15:00", pickupUntil: "16:00",
      bookingDeadline: `${offerDate}T14:00:00-05:00`, capacity: 1,
    });
    const hourWindow = (await db.query("SELECT pickup_until AS legacy,pickup_until_extended AS actual FROM offers WHERE id=$1", [hourOffer])).rows[0];
    assert.equal(hourWindow.legacy, "15:10");
    assert.equal(hourWindow.actual, "16:00");
    assert.equal((await getCatalog()).offerings.find((offer) => offer.id === hourOffer).pickupUntil, "16:00");
    await assert.rejects(saveOffer("test-kitchen", {
      dishId, date: offerDate, deliveryTime: "15:00", pickupUntil: "16:01",
      bookingDeadline: `${offerDate}T14:00:00-05:00`, capacity: 1,
    }), /máximo 1 hora/);
    await assert.rejects(db.query("UPDATE offers SET pickup_until_extended='16:01' WHERE id=$1", [hourOffer]));
    console.log(
      "libSQL: migración, reserva, Yape, aprobación, porción adicional y vencimiento correctos.",
    );
  } finally {
    await closeDb();
  }
}
