import { createClient } from "@libsql/client";

let client;
let pendingWrite = Promise.resolve();
const booleanColumns = new Set([
  "active",
  "required",
  "withinBookingWindow",
  "customizationOverride",
  "hasCustomizationOverride",
  "bookingAllowed",
  "reviewEnabled",
  "manualAdded",
]);

function values(args) {
  return args.map((value) =>
    value instanceof Date
      ? value.toISOString()
      : typeof value === "boolean"
        ? Number(value)
        : Buffer.isBuffer(value)
          ? new Uint8Array(value)
          : value,
  );
}

function prepare(sql, args = []) {
  const bound = [];
  const statement = sql
    .replace(
      /=\s*ANY\(\$(\d+)::text\[\]\)|\$(\d+)/g,
      (_, arrayIndex, scalarIndex) => {
        const value = args[Number(arrayIndex || scalarIndex) - 1];

        if (arrayIndex) {
          if (!Array.isArray(value))
            throw new TypeError("Se esperaba una lista de identificadores.");
          bound.push(...values(value));

          return ` IN (${value.map(() => "?").join(",") || "NULL"})`;
        }
        bound.push(...values([value]));

        return "?";
      },
    )
    .replace(/::(?:text|date|jsonb|integer|float8|numeric)/g, "");

  return { sql: statement, args: bound };
}

function result(raw, sql) {
  const rows = raw.rows.map((entry) =>
    Object.fromEntries(
      Object.entries(entry).map(([key, value]) => [
        key,
        booleanColumns.has(key) && value !== null ? Boolean(value) : value,
      ]),
    ),
  );

  return {
    rows,
    rowCount: /^\s*(SELECT|WITH)\b/i.test(sql)
      ? rows.length
      : Number(raw.rowsAffected || rows.length),
    lastInsertRowid: raw.lastInsertRowid,
  };
}

function queryFor(connection) {
  return async (sql, args = []) => {
    const raw = await connection.execute(prepare(sql, args));

    return result(raw, sql);
  };
}

export function getDb() {
  if (!client) {
    const url =
      process.env.TURSO_DATABASE_URL ||
      (process.env.VERCEL ? null : "file:local.db");

    if (!url)
      throw new Error("Falta TURSO_DATABASE_URL para la base de consumidores.");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }

  return { query: queryFor(client) };
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = undefined;
  }
}

export async function transaction(work) {
  getDb();
  const previous = pendingWrite;
  let release;

  pendingWrite = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      let tx;

      try {
        tx = await client.transaction("write");
        const value = await work({ query: queryFor(tx) });

        await tx.commit();

        return value;
      } catch (error) {
        if (tx) await tx.rollback().catch(() => {});

        if (error.code !== "SQLITE_BUSY" || attempt === 5) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
      } finally {
        if (tx) tx.close();
      }
    }
  } finally {
    release();
  }
}
