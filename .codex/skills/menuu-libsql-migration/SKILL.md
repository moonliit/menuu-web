---
name: menuu-libsql-migration
description: Plan, implement, or review a Menúu consumer database schema or data change for the existing Vercel and Turso deployment. Use when tables, columns, indexes, data backfills, or migration behavior change.
---

# Menúu libSQL migration

Read the parent `AGENTS.md`, `README.md`, `docs/arquitectura-datos.md`, `server/db.mjs`, `scripts/migrate.mjs`, and the relevant queries before writing SQL. The active database is libSQL: local SQLite for development and a separate Turso database for consumers in Vercel. `docs/postgres-migrations/` is historical, and the landing has another Turso database.

Create a new numbered file in `server/migrations/`; never edit an applied migration to change production behavior. Account for both a fresh database and one containing existing users, offers, and orders. Keep changes compatible with the API version that may run while Vercel functions roll over. Inspect constraints, indexes, backfills, null handling, and transaction behavior. The function runs migrations on an API request, so check the production and preview environment mapping and backup/restore readiness before an authorized release; do not assume they are isolated.

Extend `scripts/test-libsql.mjs` when the migration affects persisted behavior, including upgrade from an older schema and `PRAGMA foreign_key_check` when relevant. Run tests against its temporary database, not `local.db` or Turso. Run the build and report the SQL change, compatibility assumptions, verification, and any deployment check still needed. Deployment and production data changes follow the user's authorization for that action.
