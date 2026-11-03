import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deliveryMoment } from "./catalog.mjs";
import { careers } from "./careers.mjs";
import { closeDb, getDb } from "./db.mjs";
import {
  createBooking,
  findUserByEmail,
  getCatalog,
  getOrders,
  insertSession,
  insertUser,
  removeSession,
  submitReview,
  updateConsumerProfile,
  userFromSession,
} from "./repository.mjs";
import { hashPassword, publicUser, verifyPassword } from "./store.mjs";
import {
  kitchenData,
  kitchenImage,
  saveDish,
  saveKitchenImage,
  saveOffer,
  updateKitchen,
} from "./kitchen.mjs";
import { migrate } from "../scripts/migrate.mjs";

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
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
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

function visibleOrder(order, now = new Date()) {
  if (order.status !== "reservado") return order;

  if (order.fulfillmentStatus === "delivered")
    return { ...order, status: "entregado" };

  if (order.fulfillmentStatus === "no_show")
    return { ...order, status: "no_se_presento" };

  return deliveryMoment(order.date, order.pickupUntil) <= now
    ? { ...order, status: "entrega_pendiente" }
    : order;
}

async function handleApi(req, res, url) {
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

  if (url.pathname.startsWith("/api/kitchen/")) {
    const user = await userFromSession(sessionToken(req));

    if (!user || user.role !== "kitchen" || !user.kitchenId)
      return error(res, 401, "Inicia sesión como cocina.");

    if (req.method === "GET" && url.pathname === "/api/kitchen/data")
      return json(res, 200, await kitchenData(user.kitchenId));

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

    return error(res, 404, "Ruta no encontrada.");
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
      typeof data.studentCode === "string" ? data.studentCode.trim() : "";
    const career = typeof data.career === "string" ? data.career.trim() : "";
    const birthDate =
      data.birthDate == null || data.birthDate === "" ? null : data.birthDate;

    if (name.length < 2 || name.length > 80)
      return error(res, 400, "Escribe tu nombre (2 a 80 caracteres).");

    if (!validateEmail(email))
      return error(res, 400, "Usa tu correo institucional @utec.edu.pe.");

    if (!/^[0-9]{9}$/.test(studentCode))
      return error(res, 400, "El código de estudiante debe tener 9 dígitos.");

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
    const role = data.role === "kitchen" ? "kitchen" : "consumer";
    const user = await findUserByEmail(email);

    if (!user || !verifyPassword(password, user.passwordHash))
      return error(res, 401, "Correo o contraseña incorrectos.");

    if (user.role !== role)
      return error(
        res,
        403,
        role === "kitchen"
          ? "Esta cuenta no tiene acceso de cocina."
          : "Esta cuenta pertenece a una cocina. Usa el acceso de cocinas.",
      );
    const token = randomBytes(32).toString("hex");

    await insertSession(token, user.id);
    res.setHeader("Set-Cookie", sessionCookie(req, token, 7 * 86400));

    return json(res, 200, { user: publicUser(user) });
  }

  if (url.pathname === "/api/auth/google") {
    let email = "";
    let name = "";

    if (typeof data.credential === "string" && data.credential) {
      try {
        const parts = data.credential.split(".");

        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], "base64url").toString("utf8"),
          );

          email =
            typeof payload.email === "string"
              ? payload.email.trim().toLowerCase()
              : "";
          name = typeof payload.name === "string" ? payload.name.trim() : "";
        }
      } catch {
        return error(res, 400, "Token de Google inválido.");
      }
    } else {
      email =
        typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
      name = typeof data.name === "string" ? data.name.trim() : "";
    }

    if (!email) return error(res, 400, "Indica tu cuenta de Google.");

    if (!validateEmail(email))
      return error(
        res,
        400,
        "Solo puedes acceder con una cuenta institucional de Google (@utec.edu.pe).",
      );

    let user = await findUserByEmail(email);

    if (user) {
      if (user.role !== "consumer")
        return error(
          res,
          403,
          "Esta cuenta pertenece a una cocina. Usa el acceso de cocinas.",
        );

      const token = randomBytes(32).toString("hex");

      await insertSession(token, user.id);
      res.setHeader("Set-Cookie", sessionCookie(req, token, 7 * 86400));

      return json(res, 200, {
        status: "authenticated",
        user: publicUser(user),
      });
    }

    // El alumno no está registrado aún
    const studentCode =
      typeof data.studentCode === "string" ? data.studentCode.trim() : "";
    const career = typeof data.career === "string" ? data.career.trim() : "";

    // Si aún no envía los datos de registro, indicamos que requiere completar registro
    if (!studentCode || !career) {
      return json(res, 200, {
        status: "needs_registration",
        email,
        name:
          name ||
          email
            .split("@")[0]
            .replace(/[._-]/g, " ")
            .split(" ")
            .filter(Boolean)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
      });
    }

    // Proceso de registro usual
    const regName =
      (typeof data.name === "string" ? data.name.trim() : "") || name;
    const birthDate =
      data.birthDate == null || data.birthDate === "" ? null : data.birthDate;

    if (regName.length < 2 || regName.length > 80)
      return error(res, 400, "Escribe tu nombre completo (2 a 80 caracteres).");

    if (!/^[0-9]{9}$/.test(studentCode))
      return error(res, 400, "El código de estudiante debe tener 9 dígitos.");

    if (!careers.includes(career))
      return error(res, 400, "Selecciona una carrera de la lista.");

    if (!validBirthDate(birthDate))
      return error(
        res,
        400,
        "Escribe una fecha de nacimiento válida que no sea futura.",
      );

    user = {
      id: randomUUID(),
      name: regName,
      email,
      role: "consumer",
      studentCode,
      career,
      birthDate,
      passwordHash: hashPassword(randomBytes(16).toString("hex")),
    };

    try {
      await insertUser(user);
    } catch (cause) {
      if (String(cause?.code || cause?.message).includes("CONSTRAINT_UNIQUE")) {
        return error(
          res,
          409,
          /student_code/i.test(cause.message)
            ? "Ese código de estudiante ya está registrado."
            : "Ese correo ya tiene una cuenta.",
        );
      }
      throw cause;
    }

    const token = randomBytes(32).toString("hex");

    await insertSession(token, user.id);
    res.setHeader("Set-Cookie", sessionCookie(req, token, 7 * 86400));

    return json(res, 201, {
      status: "authenticated",
      user: publicUser(user),
    });
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
      typeof data.studentCode === "string" ? data.studentCode.trim() : "";
    const career = typeof data.career === "string" ? data.career.trim() : "";
    const birthDate =
      data.birthDate == null || data.birthDate === "" ? null : data.birthDate;

    if (name.length < 2 || name.length > 80)
      return error(res, 400, "Escribe tu nombre (2 a 80 caracteres).");

    if (!/^[0-9]{9}$/.test(studentCode))
      return error(res, 400, "El código de estudiante debe tener 9 dígitos.");

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
