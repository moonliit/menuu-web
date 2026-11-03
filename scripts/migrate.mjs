import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { closeDb, getDb, transaction } from "../server/db.mjs";

export async function migrate() {
  await getDb().query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
  );
  const directory = fileURLToPath(
    new URL("../server/migrations/", import.meta.url),
  );

  for (const name of (await readdir(directory))
    .filter((value) => value.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(join(directory, name), "utf8");
    const needsForeignKeysOff = sql.startsWith("-- @foreign-keys-off");

    if (
      needsForeignKeysOff &&
      (
        await getDb().query("SELECT 1 FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    )
      continue;
    const foreignKeysEnabled = needsForeignKeysOff
      ? Number(
          (await getDb().query("PRAGMA foreign_keys")).rows[0].foreign_keys,
        )
      : null;

    if (needsForeignKeysOff) await getDb().query("PRAGMA foreign_keys=OFF");
    try {
      const applied = await transaction(async (db) => {
        if (
          (
            await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
              name,
            ])
          ).rowCount
        )
          return false;

        if (
          needsForeignKeysOff &&
          Number(
            (await db.query("PRAGMA foreign_keys")).rows[0].foreign_keys,
          ) !== 0
        )
          throw new Error(
            `No se desactivaron las claves foráneas para ${name}.`,
          );
        for (const statement of sql
          .split(/;\s*(?:\r?\n|$)/)
          .map((value) => value.trim())
          .filter(Boolean))
          await db.query(statement);

        if (needsForeignKeysOff) {
          const invalid = await db.query("PRAGMA foreign_key_check");

          if (invalid.rows.length)
            throw new Error(
              `La migración ${name} dejaría referencias inválidas.`,
            );
        }
        await db.query("INSERT INTO schema_migrations(name) VALUES ($1)", [
          name,
        ]);

        return true;
      });

      if (applied) console.log(`Migración aplicada: ${name}`);
    } finally {
      if (needsForeignKeysOff)
        await getDb().query(`PRAGMA foreign_keys=${foreignKeysEnabled}`);
    }
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    await migrate();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
