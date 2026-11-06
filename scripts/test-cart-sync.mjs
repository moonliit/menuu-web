import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

process.env.TURSO_DATABASE_URL = "file::memory:";

const { closeDb, getDb } = await import("../server/db.mjs");
const { changeCart, getCart } = await import("../server/cart.mjs");

try {
  const db = getDb();
  await db.query("CREATE TABLE users(id TEXT PRIMARY KEY)");
  await db.query("INSERT INTO users(id) VALUES('student')");
  const migration = await readFile(fileURLToPath(new URL("../server/migrations/0023_consumer_carts.sql", import.meta.url)), "utf8");
  await db.query(migration);

  const item = { offeringId: "offer-1", choices: {}, comment: "", quantity: 1 };
  await changeCart("student", { type: "add", item });
  assert.equal((await getCart("student")).items[0].quantity, 1);

  const key = (await getCart("student")).items[0].key;
  await Promise.all([
    changeCart("student", { type: "quantity", key, delta: 1 }),
    changeCart("student", { type: "quantity", key, delta: 1 }),
  ]);
  assert.equal((await getCart("student")).items[0].quantity, 3);

  await changeCart("student", { type: "merge", items: [
    { ...item, quantity: 2 },
    { offeringId: "offer-2", choices: {}, comment: "sin cubiertos", quantity: 1 },
  ] });
  const merged = await getCart("student");
  assert.equal(merged.items.find((entry) => entry.key === key).quantity, 5);
  assert.equal(merged.items.length, 2);

  await changeCart("student", { type: "remove", key });
  assert.equal((await getCart("student")).items.length, 1);
  await changeCart("student", { type: "clear" });
  assert.deepEqual((await getCart("student")).items, []);
  console.log("Cart sync OK");
} finally {
  await closeDb();
}
