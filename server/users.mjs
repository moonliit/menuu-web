import { randomUUID } from "node:crypto";
import { getDb, transaction } from "./db.mjs";
import { getOrdersPage } from "./repository.mjs";

const invalid = (message, status = 400) => Object.assign(new Error(message), { status });

export async function adminUsers({ q = "", limit = 20, offset = 0 } = {}) {
  const search = String(q).trim().slice(0, 100);
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = search ? "WHERE (u.name LIKE $1 ESCAPE '\\' OR u.email LIKE $1 ESCAPE '\\' OR u.student_code LIKE $1 ESCAPE '\\')" : "";
  const args = search ? [pattern] : [];
  const [rows, count] = await Promise.all([
    getDb().query(`SELECT u.id,u.name,u.email,u.role,u.student_code AS "studentCode",u.created_at AS "createdAt",u.banned_at AS "bannedAt",
      (SELECT count(*) FROM orders o WHERE o.user_id=u.id AND NOT EXISTS(SELECT 1 FROM kitchen_reservation_events e WHERE e.order_id=o.id AND e.action='manual_remove')) AS "orderCount"
      FROM users u ${where} ORDER BY u.created_at DESC,u.id DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`, [...args, limit, offset]),
    getDb().query(`SELECT count(*) AS total FROM users u ${where}`, args),
  ]);
  return { users: rows.rows.map((row) => ({ ...row, orderCount: Number(row.orderCount) })), total: Number(count.rows[0].total), limit, offset };
}

export async function adminUserOrders(userId, page) {
  const exists = await getDb().query("SELECT id FROM users WHERE id=$1", [userId]);
  if (!exists.rows.length) throw invalid("Usuario no encontrado.", 404);
  return getOrdersPage(userId, page);
}

export async function setUserBan(actorId, userId, action) {
  if (!['ban', 'restore'].includes(action)) throw invalid("Acción inválida.");
  if (actorId === userId) throw invalid("No puedes banear tu propia cuenta.", 403);
  return transaction(async (db) => {
    const found = await db.query("SELECT id,role,banned_at AS \"bannedAt\" FROM users WHERE id=$1", [userId]);
    const user = found.rows[0];
    if (!user) throw invalid("Usuario no encontrado.", 404);
    if (user.role === "admin") throw invalid("Las cuentas de admin no se pueden banear desde este panel.", 403);
    if (action === "ban" && user.bannedAt || action === "restore" && !user.bannedAt)
      throw invalid("El estado de esta cuenta ya cambió. Actualiza la lista.", 409);
    const changed = await db.query(`UPDATE users SET banned_at=${action === "ban" ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : "NULL"},banned_by=$2 WHERE id=$1 RETURNING banned_at AS "bannedAt"`, [userId, action === "ban" ? actorId : null]);
    if (action === "ban") await db.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
    await db.query("INSERT INTO admin_user_events (id,actor_id,user_id,action) VALUES ($1,$2,$3,$4)", [randomUUID(), actorId, userId, action]);
    return { bannedAt: changed.rows[0].bannedAt };
  });
}
