import { getDb, transaction } from "./db.mjs";

const invalid = () => Object.assign(new Error("Carrito inválido."), { status: 400 });

function itemFrom(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const { offeringId, choices, comment, quantity } = value;
  if (typeof offeringId !== "string" || offeringId.length > 100 || !offeringId ||
      !choices || typeof choices !== "object" || Array.isArray(choices) ||
      typeof comment !== "string" || comment.length > 500 ||
      !Number.isInteger(quantity) || quantity < 1 || quantity > 10 ||
      Object.keys(choices).length > 30) throw invalid();
  const cleanChoices = {};
  for (const [group, ids] of Object.entries(choices)) {
    if (group.length > 100 || !Array.isArray(ids) || ids.length > 30 ||
        ids.some((id) => typeof id !== "string" || !id || id.length > 100)) throw invalid();
    cleanChoices[group] = [...new Set(ids)];
  }
  const key = JSON.stringify([offeringId, cleanChoices, comment]);
  return { key, offeringId, choices: cleanChoices, comment, quantity };
}

function parseItems(raw) {
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

export async function getCart(userId) {
  const result = await getDb().query("SELECT items_json FROM consumer_carts WHERE user_id=$1", [userId]);
  return { items: parseItems(result.rows[0]?.items_json || "[]") };
}

export async function changeCart(userId, action) {
  if (!action || typeof action !== "object") throw invalid();
  return transaction(async (db) => {
    const result = await db.query("SELECT items_json FROM consumer_carts WHERE user_id=$1", [userId]);
    let items = parseItems(result.rows[0]?.items_json || "[]");
    if (action.type === "add" || action.type === "merge") {
      const incoming = action.type === "add" ? [itemFrom(action.item)] :
        Array.isArray(action.items) && action.items.length <= 30 ? action.items.map(itemFrom) : null;
      if (!incoming) throw invalid();
      for (const item of incoming) {
        const existing = items.find((entry) => entry.key === item.key);
        if (existing) existing.quantity = Math.min(10, existing.quantity + item.quantity);
        else items.push(item);
      }
    } else if (action.type === "quantity") {
      if (typeof action.key !== "string" || action.key.length > 2000 ||
          !Number.isInteger(action.delta) || ![-1, 1].includes(action.delta)) throw invalid();
      items = items.map((item) => item.key === action.key
        ? { ...item, quantity: Math.min(10, item.quantity + action.delta) } : item)
        .filter((item) => item.quantity > 0);
    } else if (action.type === "remove") {
      if (typeof action.key !== "string" || action.key.length > 2000) throw invalid();
      items = items.filter((item) => item.key !== action.key);
    } else if (action.type === "clear") items = [];
    else throw invalid();
    if (items.length > 30) throw invalid();
    await db.query("INSERT INTO consumer_carts(user_id,items_json) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET items_json=excluded.items_json, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')", [userId, JSON.stringify(items)]);
    return { items };
  });
}
