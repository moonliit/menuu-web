import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

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
  } finally {
    if (
      !resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`) ||
      !basename(directory).startsWith("menuu-libsql-")
    )
      throw new Error("Ruta temporal inesperada.");
    await rm(directory, { recursive: true, force: true });
  }
} else {
  process.env.TURSO_DATABASE_URL = `file:${process.env.MENUU_TEST_DB_PATH}`;
  delete process.env.TURSO_AUTH_TOKEN;

  const { migrate } = await import("./migrate.mjs");
  const { closeDb, getDb } = await import("../server/db.mjs");
  const { weekStart } = await import("../server/catalog.mjs");
  const { hashPassword } = await import("../server/store.mjs");
  const { createBooking, getCatalog, getOrders, insertUser, submitReview } =
    await import("../server/repository.mjs");
  const { kitchenData, kitchenImage, saveDish, saveKitchenImage, saveOffer } =
    await import("../server/kitchen.mjs");
  const { handleRequest } = await import("../server/index.mjs");

  try {
    await migrate();
    await migrate();
    const db = getDb();

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
    await submitReview(
      consumers[0].id,
      order.id,
      {
        kitchenRating: 5,
        foodRatings: [{ orderItemId: String(order.items[0].id), rating: 4 }],
      },
      new Date(`${offerDate}T14:00:00-05:00`),
    );
    assert.equal((await getCatalog()).kitchens[0].rating, 5);
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

      assert.equal(registered.status, 201);
      const cookie = registered.headers.get("set-cookie").split(";")[0];
      const bootstrap = await fetch(`${base}/api/bootstrap`, {
        headers: { Cookie: cookie },
      });

      assert.equal(bootstrap.status, 200);
      assert.equal((await bootstrap.json()).user.email, "nueva@utec.edu.pe");

      // Prueba de acceso con Google para nuevo estudiante (requiere completar registro)
      const googleNew = await fetch(`${base}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alumno.google@utec.edu.pe",
          name: "Alumno Google",
        }),
      });

      assert.equal(googleNew.status, 200);
      const googleNewRes = await googleNew.json();

      assert.equal(googleNewRes.status, "needs_registration");
      assert.equal(googleNewRes.email, "alumno.google@utec.edu.pe");

      // El nuevo estudiante completa su proceso de registro usual
      const googleRegister = await fetch(`${base}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alumno.google@utec.edu.pe",
          name: "Alumno Google",
          studentCode: "202610999",
          career: "Ciencia de la Computación",
          birthDate: null,
        }),
      });

      assert.equal(googleRegister.status, 201);
      const googleRegRes = await googleRegister.json();

      assert.equal(googleRegRes.status, "authenticated");
      assert.equal(googleRegRes.user.email, "alumno.google@utec.edu.pe");
      assert.equal(googleRegRes.user.studentCode, "202610999");

      // Prueba de acceso con Google para estudiante ya existente (ingresa directo)
      const googleExisting = await fetch(`${base}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "alumno.google@utec.edu.pe",
        }),
      });

      assert.equal(googleExisting.status, 200);
      const googleExistRes = await googleExisting.json();

      assert.equal(googleExistRes.status, "authenticated");
      assert.equal(googleExistRes.user.email, "alumno.google@utec.edu.pe");

      // Rechazo de correo no institucional
      const googleInvalid = await fetch(`${base}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "usuario@gmail.com",
        }),
      });

      assert.equal(googleInvalid.status, 400);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    console.log(
      "libSQL: migración, catálogo, reserva, idempotencia, cupo, estadísticas, imagen y reseña correctos.",
    );
  } finally {
    await closeDb();
  }
}
