import { randomUUID } from "node:crypto";

const databaseUrl = process.env.MENUU_ADMIN_DATABASE_URL;
const email = process.env.MENUU_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.MENUU_ADMIN_PASSWORD;
const name = process.env.MENUU_ADMIN_NAME?.trim() || "Administrador Menúu";

if (
  !databaseUrl ||
  !/^(file:|libsql:)/.test(databaseUrl) ||
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !password ||
  password.length < 12 ||
  name.length < 2 ||
  name.length > 80
) {
  console.error(
    "Define MENUU_ADMIN_DATABASE_URL, MENUU_ADMIN_EMAIL y MENUU_ADMIN_PASSWORD (mínimo 12 caracteres). Puedes definir MENUU_ADMIN_NAME.",
  );
  process.exitCode = 1;
} else {
  process.env.TURSO_DATABASE_URL = databaseUrl;

  if (process.env.MENUU_ADMIN_AUTH_TOKEN)
    process.env.TURSO_AUTH_TOKEN = process.env.MENUU_ADMIN_AUTH_TOKEN;
  else delete process.env.TURSO_AUTH_TOKEN;
  const { migrate } = await import("./migrate.mjs");
  const { closeDb, getDb } = await import("../server/db.mjs");
  const { hashPassword } = await import("../server/store.mjs");

  try {
    await migrate();
    const existing = await getDb().query(
      "SELECT id FROM users WHERE email=$1",
      [email],
    );

    if (existing.rowCount)
      throw new Error("Ya existe una cuenta con ese correo.");
    await getDb().query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'admin')",
      [randomUUID(), name, email, hashPassword(password)],
    );
    console.log(`Cuenta admin creada: ${email}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
