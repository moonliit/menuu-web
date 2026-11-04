CREATE TABLE placeholder_reservations (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES offers(id),
  kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
  dish_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
  booking_deadline_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','linked','cancelled')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  linked_user_id TEXT REFERENCES users(id),
  linked_order_id TEXT REFERENCES orders(id),
  linked_by TEXT REFERENCES users(id),
  linked_at TEXT,
  cancelled_by TEXT REFERENCES users(id),
  cancelled_at TEXT
);
CREATE INDEX placeholder_reservations_offer_idx ON placeholder_reservations(offer_id,status);
