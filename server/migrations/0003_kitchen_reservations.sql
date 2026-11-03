ALTER TABLE orders ADD COLUMN pickup_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (pickup_confirmed IN (0,1));
ALTER TABLE orders ADD COLUMN payment_recorded TEXT CHECK (payment_recorded IN ('QR','Efectivo','Transferencia','Otro'));
UPDATE orders SET pickup_point='Entrada del Comedor UTEC en piso 2' WHERE pickup_point IN ('Comedor UTEC','Cafetería de UTEC');
CREATE INDEX orders_kitchen_date_idx ON orders(kitchen_id,offer_date,delivery_time);
CREATE TABLE kitchen_reservation_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX kitchen_reservation_events_order_idx ON kitchen_reservation_events(order_id,created_at);
