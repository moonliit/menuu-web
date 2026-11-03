---
name: menuu-product-change
description: Change Menúu consumer or kitchen behavior when a rule crosses React UI, API, libSQL queries, and user-visible states. Use for reservations, delivery, availability, accounts, permissions, ratings, or weekly menus.
---

# Menúu product change

Read the parent `AGENTS.md` and trace the requested behavior through `src/App.tsx` or `src/KitchenDashboard.tsx`, `server/index.mjs`, the owning server module, and `docs/arquitectura-datos.md`. Treat the written product rule and the live behavior as evidence; resolve discrepancies before copying an existing implementation. Keep the current React/Vite and Vercel/libSQL architecture.

Map each state transition and its effect on cupo, user eligibility, history, analytics, and visible labels. For kitchen operations, verify role and `kitchen_id` checks at the API and query boundaries. An unconfirmed pickup stays pending; only an explicit `no_show` restricts further reservations. Changes to status or permissions need an actor and timestamp where the product rules require audit. Preserve the distinction between reservation deadline and pickup window.

Add or adjust the smallest meaningful regression check in `scripts/test-libsql.mjs` for server behavior. Exercise a temporary database rather than `local.db` or Turso. Verify the UI path at relevant widths when browser access is available. Run TypeScript, the build, and the focused libSQL test when dependencies are present. State what was observed and what remains unverified; update project documentation if the behavior or shared rule changed.
