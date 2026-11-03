import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryMoment } from "./catalog.mjs";
import {
  adminData,
  adminOfferKitchen,
  adminOrderKitchen,
  updateAdminCapacity,
} from "./admin.mjs";
import { careers } from "./careers.mjs";
import { closeDb } from "./db.mjs";
import {
  cancelOrder,
  createBooking,
  findUserByEmail,
  getCatalog,
  getOrders,
  getOrdersPage,
  insertSession,
  insertUser,
  removeSession,
  submitReview,
  updateConsumerProfile,
  userFromSession,
} from "./repository.mjs";
import { hashPassword, publicUser, verifyPassword } from "./store.mjs";
import {
  addExtraPortion,
  addKitchenReservation,
  kitchenData,
  kitchenImage,
  kitchenStudentCandidates,
  saveDish,
  saveKitchenImage,
  saveOffer,
  updateKitchen,
  updateKitchenReservation,
} from "./kitchen.mjs";
import { migrate } from "../scripts/migrate.mjs";
import { dispatchPickupReminders, pushConfig, removePushSubscription, savePushSubscription, validDispatchSecret } from "./push.mjs";
import { expireUnpaidCheckouts, paymentProof, pendingPayments, reviewPayment, submitPaymentProof } from "./payments.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const isDev = process.argv.includes("--dev");
const port = Number(process.env.PORT || (isDev ? 5173 : 4173));
let migrationPromise;
let vite = null;

function ensureMigrated() {
  if (!migrationPromise)
    migrationPromise = migrate().catch((error) => {
      migrationPromise = undefined;
      throw error;
    });

  return migrationPromise;
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res, status, value, cacheControl = "no-store") {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
  });
  res.end(JSON.stringify(value));
}

function error(res, status, message) {
  json(res, status, { error: message });
}

async function body(req) {
  let parsed;

  try {
    parsed = req.body;
  } catch {
    throw Object.assign(new Error("Datos inválidos."), { status: 400 });
  }

  if (parsed !== undefined) {
    const raw =
      typeof parsed === "string" ? parsed : JSON.stringify(parsed ?? {});

    if (Buffer.byteLength(raw) > 32_000)
      throw Object.assign(new Error("Solicitud demasiado grande."), {
        status: 413,
      });
    try {
      return typeof parsed === "string"
        ? JSON.parse(parsed || "{}")
        : (parsed ?? {});
    } catch {
      throw Object.assign(new Error("Datos inválidos."), { status: 400 });
    }
  }
  let raw = "";

  for await (const chunk of req) {
    raw += chunk;

    if (raw.length > 32_000)
      throw Object.assign(new Error("Solicitud demasiado grande."), {
        status: 413,
      });
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw Object.assign(new Error("Datos inválidos."), { status: 400 });
  }
}

function sessionToken(req) {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("menuu_session="));

  return cookie?.slice("menuu_session=".length);
}

function sessionCookie(req, token, age) {
  const secure =
    req.headers["x-forwarded-proto"] === "https" ||
    Boolean(req.socket.encrypted);

  return `menuu_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure ? "; Secure" : ""}`;
}

function sameOrigin(req) {
  const origin = req.headers.origin;

  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function validateEmail(email) {
  return (
    typeof email === "string" && /^[^\s@]+@utec\.edu\.pe$/i.test(email.trim())
  );
}

function validBirthDate(value) {
  if (value === null) return true;

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T12:00:00Z`);

  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;

  return (
    value >= "1900-01-01" &&
    value <= `${get("year")}-${get("month")}-${get("day")}`
  );
}

function listPage(url, defaultLimit = 20) {
  const limit = Number(url.searchParams.get("limit") ?? defaultLimit);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100000)
    throw Object.assign(new Error("Paginación inválida."), { status: 400 });
  return { limit, offset };
}

function visibleOrder(order, now = new Date()) {
  if (order.status !== "reservado") return order;
  if (order.paymentCheckoutId && order.paymentStatus !== "approved") return order;

  if (order.fulfillmentStatus === "delivered")
    return { ...order, status: "entregado" };

  if (order.fulfillmentStatus === "no_show")
    return { ...order, status: "no_se_presento" };

  return deliveryMoment(order.date, order.pickupUntil) <= now
    ? { ...order, status: "entrega_pendiente" }
    : order;
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/catalog" || url.pathname === "/api/bookings" || url.pathname === "/api/orders" || url.pathname === "/api/bootstrap" || url.pathname === "/api/admin/data")
    await expireUnpaidCheckouts();
  if (req.method === "GET" && url.pathname === "/api/push/dispatch") {
    if (!validDispatchSecret(req.headers.authorization))
      return error(res, 401, "Acceso no permitido.");
    return json(res, 200, await dispatchPickupReminders());
  }
  if (req.method === "GET" && url.pathname === "/api/push/config")
    return json(res, 200, pushConfig());
  if (url.pathname === "/api/push/subscription" || url.pathname === "/api/push/unsubscribe") {
    if (req.method !== "POST" || !sameOrigin(req)) return error(res, 403, "Solicitud no permitida.");
    const user = await userFromSession(sessionToken(req));
    if (!user || user.role !== "consumer") return error(res, 401, "Inicia sesión como estudiante.");
    const data = await body(req);
    return json(res, 200, url.pathname === "/api/push/subscription"
      ? await savePushSubscription(user.id, data)
      : await removePushSubscription(user.id, data?.endpoint));
  }
  const imageMatch = /^\/api\/kitchen\/image\/([a-f0-9-]{36})$/.exec(
    url.pathname,
  );

  if (req.method === "GET" && imageMatch) {
    const image = await kitchenImage(imageMatch[1]);

    if (!image) return error(res, 404, "Imagen no encontrada.");
    res.writeHead(200, {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });

    return res.end(image.content);
  }

  if (url.pathname.startsWith("/api/admin/")) {
    const user = await userFromSession(sessionToken(req));
    if (!user) return error(res, 401, "Inicia sesión como admin.");
    if (user.role !== "admin")
      return error(res, 403, "Acceso de admin requerido.");
    if (req.method === "GET" && url.pathname === "/api/admin/payments")
      return json(res, 200, { payments: await pendingPayments() });
    if (req.method === "GET" && url.pathname === "/api/admin/data") {
      const weekValue = url.searchParams.get("week");
      const week = weekValue === null ? null : Number(weekValue);
      const kitchen = url.searchParams.get("kitchen") || "all";
      if ((week !== null && ![0, 1].includes(week)) ||
          (kitchen !== "all" && !/^[a-zA-Z0-9-]{1,100}$/.test(kitchen)))
        return error(res, 400, "Filtros inválidos.");
      return json(res, 200, await adminData({ week, kitchen, ...listPage(url) }));
    }
    const candidatesMatch =
      /^\/api\/admin\/offers\/([a-zA-Z0-9-]+)\/students$/.exec(url.pathname);
    if (req.method === "GET" && candidatesMatch) {
      const kitchenId = await adminOfferKitchen(candidatesMatch[1]);
      return json(res, 200,
        await kitchenStudentCandidates(
          kitchenId,
          candidatesMatch[1],
          url.searchParams.get("q") || "",
          listPage(url),
        ),
      );
    }
    if (req.method !== "POST" || !sameOrigin(req))
      return error(res, 403, "Solicitud no permitida.");
    const data = await body(req);
    const reviewMatch = /^\/api\/admin\/payments\/([a-f0-9-]{36})\/review$/.exec(url.pathname);
    if (reviewMatch)
      return json(res, 200, await reviewPayment(reviewMatch[1], user.id, data?.decision, data?.note));
    if (url.pathname === "/api/admin/offers/capacity")
      return json(res, 200, await updateAdminCapacity(user.id, data));
    if (url.pathname === "/api/admin/reservations/add") {
      const kitchenId = await adminOfferKitchen(data?.offerId);
      return json(
        res,
        201,
        await addKitchenReservation(kitchenId, user.id, data),
      );
    }
    if (url.pathname === "/api/admin/reservations/extra") {
      const kitchenId = await adminOrderKitchen(data?.orderId);
      return json(res, 201, await addExtraPortion(kitchenId, user.id, data));
    }
    if (url.pathname === "/api/admin/reservations/update") {
      const kitchenId = await adminOrderKitchen(data?.orderId);
      return json(
        res,
        200,
        await updateKitchenReservation(kitchenId, user.id, data, true),
      );
    }
    return error(res, 404, "Ruta no encontrada.");
  }

  if (url.pathname.startsWith("/api/kitchen/")) {
    const user = await userFromSession(sessionToken(req));

    if (!user || user.role !== "kitchen" || !user.kitchenId)
      return error(res, 401, "Inicia sesión como cocina.");

    if (req.method === "GET" && url.pathname === "/api/kitchen/data") {
      return json(res, 200, await kitchenData(user.kitchenId, {
        includeAnalytics: url.searchParams.get("scope") !== "operations",
      }));
    }
    const candidatesMatch =
      /^\/api\/kitchen\/offers\/([a-zA-Z0-9-]+)\/students$/.exec(url.pathname);
    if (req.method === "GET" && candidatesMatch)
      return json(res, 200,
        await kitchenStudentCandidates(
          user.kitchenId,
          candidatesMatch[1],
          url.searchParams.get("q") || "",
          listPage(url),
        ),
      );

    if (req.method !== "POST" || !sameOrigin(req))
      return error(res, 403, "Solicitud no permitida.");

    if (url.pathname === "/api/kitchen/photo") {
      const mime = String(req.headers["content-type"] || "").split(";")[0];

      if (Buffer.isBuffer(req.body)) {
        if (req.body.length > 2_000_000)
          return error(res, 413, "La imagen supera 2 MB.");

        return json(res, 200, {
          url: await saveKitchenImage(
            user.kitchenId,
            req.body,
            mime,
            url.searchParams.get("scope") !== "dish",
          ),
        });
      }
      const chunks = [];
      let size = 0;

      for await (const chunk of req) {
        size += chunk.length;

        if (size > 2_000_000) return error(res, 413, "La imagen supera 2 MB.");
        chunks.push(chunk);
      }

      return json(res, 200, {
        url: await saveKitchenImage(
          user.kitchenId,
          Buffer.concat(chunks),
          mime,
          url.searchParams.get("scope") !== "dish",
        ),
      });
    }
    const data = await body(req);

    if (url.pathname === "/api/kitchen/profile") {
      await updateKitchen(user.kitchenId, data);

      return json(res, 200, { ok: true });
    }

    if (url.pathname === "/api/kitchen/dishes")
      return json(res, 200, { id: await saveDish(user.kitchenId, data) });

    if (url.pathname === "/api/kitchen/offers")
      return json(res, 200, { id: await saveOffer(user.kitchenId, data) });

    if (url.pathname === "/api/kitchen/reservations/add")
      return json(
        res,
        201,
        await addKitchenReservation(user.kitchenId, user.id, data),
      );
    if (url.pathname === "/api/kitchen/reservations/extra")
      return json(res, 201, await addExtraPortion(user.kitchenId, user.id, data));

    if (url.pathname === "/api/kitchen/reservations/update")
      return json(
        res,
        200,
        await updateKitchenReservation(user.kitchenId, user.id, data),
      );

    return error(res, 404, "Ruta no encontrada.");
  }

  if (req.method === "GET" && url.pathname === "/api/session") {
    const user = await userFromSession(sessionToken(req));
    return json(res, 200, { user: publicUser(user), careers });
  }

  if (req.method === "GET" && url.pathname === "/api/catalog")
    return json(res, 200, await getCatalog(),
      url.searchParams.has("fresh")
        ? "no-store"
        : "public, max-age=15, s-maxage=30, stale-while-revalidate=30");

  if (req.method === "GET" && url.pathname === "/api/orders") {
    const user = await userFromSession(sessionToken(req));
    if (!user || user.role !== "consumer")
      return error(res, 401, "Inicia sesión como estudiante.");
    const page = await getOrdersPage(user.id, listPage(url, 10));
    return json(res, 200, {
      ...page,
      orders: page.orders.map((order) => visibleOrder(order)),
    });
  }
  const proofMatch = /^\/api\/payments\/([a-f0-9-]{36})\/proof$/.exec(url.pathname);
  if (req.method === "GET" && proofMatch) {
    const user = await userFromSession(sessionToken(req));
    if (!user) return error(res, 401, "Inicia sesión para ver el comprobante.");
    const proof = await paymentProof(proofMatch[1], user);
    res.writeHead(200, { "Content-Type": proof.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    return res.end(proof.content);
  }
  if (req.method === "POST" && proofMatch) {
    if (!sameOrigin(req)) return error(res, 403, "Origen no permitido.");
    const user = await userFromSession(sessionToken(req));
    if (!user || user.role !== "consumer") return error(res, 401, "Inicia sesión como estudiante.");
    const mimeType = String(req.headers["content-type"] || "").split(";")[0];
    const chunks = [];
    let size = 0;
    if (Buffer.isBuffer(req.body)) {
      size = req.body.length;
      chunks.push(req.body);
    } else {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2_000_000) return error(res, 413, "La imagen supera 2 MB.");
        chunks.push(chunk);
      }
    }
    if (size > 2_000_000) return error(res, 413, "La imagen supera 2 MB.");
    return json(res, 200, await submitPaymentProof(user.id, proofMatch[1], Buffer.concat(chunks), mimeType));
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const user = await userFromSession(sessionToken(req));
    const [catalog, orders] = await Promise.all([
      getCatalog(),
      user?.role === "consumer" ? getOrders(user.id) : [],
    ]);

    return json(res, 200, {
      user: publicUser(user),
      careers,
      catalog,
      orders: orders.map((order) => visibleOrder(order)),
    });
  }

  if (req.method !== "POST") return error(res, 404, "Ruta no encontrada.");

  if (!sameOrigin(req)) return error(res, 403, "Origen no permitido.");
  const data = await body(req);

  if (url.pathname === "/api/auth/register") {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email =
      typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const password = typeof data.password === "string" ? data.password : "";
    const studentCode =
      typeof data.studentCode === "string"
        ? data.studentCode.trim().toUpperCase()
        : "";
    const career = typeof data.career === "string" ? data.career.trim() : "";
    const birthDate =
      data.birthDate == null || data.birthDate === "" ? null : data.birthDate;

    if (name.length < 2 || name.length > 80)
      return error(res, 400, "Escribe tu nombre (2 a 80 caracteres).");

    if (!validateEmail(email))
      return error(res, 400, "Usa tu correo institucional @utec.edu.pe.");

    if (
      !/^(?:[0-9]{9}|[0-9]{4}PRE[0-9]{7,8}|[0-9]{5}PRE[A-Z]{2}[0-9]{5})$/.test(
        studentCode,
      )
    )
      return error(
        res,
        400,
        "Usa 9 dígitos o un código PRE, por ejemplo 20261PREEN01008.",
      );

    if (!careers.includes(career))
      return error(res, 400, "Selecciona una carrera de la lista.");

    if (!validBirthDate(birthDate))
      return error(
        res,
        400,
        "Escribe una fecha de nacimiento válida que no sea futura.",
      );

    if (password.length < 5 || password.length > 128)
      return error(
        res,
        400,
        "La contraseña debe tener entre 5 y 128 caracteres.",
      );

    if (await findUserByEmail(email))
      return error(res, 409, "Ese correo ya tiene una cuenta.");
    const user = {
      id: randomUUID(),
      name,
      email,
      role: "consumer",
      studentCode,
      career,
      birthDate,
      passwordHash: hashPassword(password),
    };

    try {
      await insertUser(user);
    } catch (cause) {
      if (String(cause.code).includes("CONSTRAINT_UNIQUE"))
        return error(
          res,
          409,
          /student_code/i.test(cause.message)
            ? "Ese código de estudiante ya está registrado."
            : "Ese correo ya tiene una cuenta.",
        );
      throw cause;
    }
    const token = randomBytes(32).toString("hex");

    await insertSession(token, user.id);
    res.setHeader("Set-Cookie", sessionCookie(req, token, 7 * 86400));

    return json(res, 201, { user: publicUser(user) });
  }

  if (url.pathname === "/api/auth/login") {
    const email =
      typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const password = typeof data.password === "string" ? data.password : "";
    const role = ["consumer", "kitchen", "admin"].includes(data.role)
      ? data.role
      : "consumer";
    const user = await findUserByEmail(email);

    if (!user || !verifyPassword(password, user.passwordHash))
      return error(res, 401, "Correo o contraseña incorrectos.");

    if (user.role !== role)
      return error(
        res,
        403,
        role === "kitchen"
          ? "Esta cuenta no tiene acceso de cocina."
          : role === "admin"
            ? "Esta cuenta no tiene acceso de admin."
            : "Esta cuenta usa otro acceso de Menúu.",
      );
    const token = randomBytes(32).toString("hex");

    await insertSession(token, user.id);
    res.setHeader("Set-Cookie", sessionCookie(req, token, 7 * 86400));

    return json(res, 200, { user: publicUser(user) });
  }

  if (url.pathname === "/api/auth/logout") {
    await removeSession(sessionToken(req));
    res.setHeader("Set-Cookie", sessionCookie(req, "", 0));

    return json(res, 200, { ok: true });
  }

  if (url.pathname === "/api/account/profile") {
    const token = sessionToken(req);
    const user = await userFromSession(token);

    if (!user || user.role !== "consumer")
      return error(res, 401, "Inicia sesión con tu cuenta de estudiante.");

    if (!data || typeof data !== "object" || Array.isArray(data))
      return error(res, 400, "Datos de perfil inválidos.");
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const studentCode =
      typeof data.studentCode === "string"
        ? data.studentCode.trim().toUpperCase()
        : "";
    const career = typeof data.career === "string" ? data.career.trim() : "";
    const birthDate =
      data.birthDate == null || data.birthDate === "" ? null : data.birthDate;

    if (name.length < 2 || name.length > 80)
      return error(res, 400, "Escribe tu nombre (2 a 80 caracteres).");

    if (
      !/^(?:[0-9]{9}|[0-9]{4}PRE[0-9]{7,8}|[0-9]{5}PRE[A-Z]{2}[0-9]{5})$/.test(
        studentCode,
      )
    )
      return error(
        res,
        400,
        "Usa 9 dígitos o un código PRE, por ejemplo 20261PREEN01008.",
      );

    if (!careers.includes(career))
      return error(res, 400, "Selecciona una carrera de la lista.");

    if (!validBirthDate(birthDate))
      return error(
        res,
        400,
        "Escribe una fecha de nacimiento válida que no sea futura.",
      );
    let updated;

    try {
      updated = await updateConsumerProfile(user.id, {
        name,
        studentCode,
        career,
        birthDate,
      });
    } catch (cause) {
      if (
        String(cause.code).includes("CONSTRAINT_UNIQUE") &&
        /student_code/i.test(cause.message)
      )
        return error(res, 409, "Ese código de estudiante ya está registrado.");
      throw cause;
    }

    if (!updated) return error(res, 404, "Cuenta no encontrada.");

    return json(res, 200, { user: publicUser(await userFromSession(token)) });
  }

  if (url.pathname === "/api/bookings") {
    const user = await userFromSession(sessionToken(req));

    if (!user || user.role !== "consumer")
      return error(res, 401, "Inicia sesión con tu cuenta de estudiante.");
    const created = await createBooking(
      user.id,
      data.items,
      data.requestKey ?? null,
    );

    return json(res, 201, { orders: created });
  }
  const cancelMatch = /^\/api\/orders\/([a-zA-Z0-9-]+)\/cancel$/.exec(
    url.pathname,
  );
  if (cancelMatch) {
    const user = await userFromSession(sessionToken(req));
    if (!user || user.role !== "consumer")
      return error(res, 401, "Inicia sesión con tu cuenta de estudiante.");
    return json(res, 200, await cancelOrder(user.id, cancelMatch[1]));
  }
  const reviewMatch = /^\/api\/orders\/([a-zA-Z0-9-]+)\/review$/.exec(
    url.pathname,
  );

  if (reviewMatch) {
    const user = await userFromSession(sessionToken(req));

    if (!user || user.role !== "consumer")
      return error(res, 401, "Inicia sesión con tu cuenta de estudiante.");

    return json(res, 201, await submitReview(user.id, reviewMatch[1], data));
  }

  return error(res, 404, "Ruta no encontrada.");
}

async function serveStatic(req, res, pathname) {
  const path = decodeURIComponent(pathname);
  const requested = path === "/" ? "index.html" : path.slice(1);
  const safe = normalize(requested);

  if (
    requested.includes("\\") ||
    requested.startsWith("/") ||
    safe.startsWith("..")
  )
    return error(res, 403, "Acceso no permitido.");
  let file = join(root, "dist", safe);

  try {
    if (!(await stat(file)).isFile()) throw new Error("not file");
  } catch {
    file = join(root, "dist", "index.html");
  }
  const content = await readFile(file);

  res.writeHead(200, {
    "Content-Type": mime[extname(file)] || "application/octet-stream",
  });
  res.end(content);
}

export async function handleRequest(req, res, apiUrl) {
  try {
    const url =
      apiUrl || new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname.startsWith("/api/")) {
      await ensureMigrated();

      return await handleApi(req, res, url);
    }

    if (vite)
      return vite.middlewares(req, res, () =>
        error(res, 404, "Página no encontrada."),
      );

    return await serveStatic(req, res, url.pathname);
  } catch (cause) {
    console.error(cause);

    if (!res.headersSent)
      error(
        res,
        cause.status || 500,
        cause.status ? cause.message : "No pudimos completar la solicitud.",
      );
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await ensureMigrated();

  if (isDev)
    vite = await (
      await import("vite")
    ).createServer({ root, server: { middlewareMode: true }, appType: "spa" });
  createServer(handleRequest).listen(
    port,
    process.env.HOST || "127.0.0.1",
    () => console.log(`Menúu consumidores: http://127.0.0.1:${port}`),
  );
  process.on("SIGTERM", () => {
    closeDb().finally(() => process.exit(0));
  });
}
