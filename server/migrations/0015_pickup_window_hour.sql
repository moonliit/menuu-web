-- @foreign-keys-off
CREATE TABLE offers_new (
  id TEXT PRIMARY KEY,
  kitchen_id TEXT NOT NULL,
  dish_id TEXT NOT NULL,
  offer_date TEXT NOT NULL,
  delivery_time TEXT NOT NULL,
  pickup_until TEXT NOT NULL,
  booking_deadline_at TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count BETWEEN 0 AND capacity),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sold_out_at TEXT,
  description_override TEXT CHECK (description_override IS NULL OR length(description_override) <= 90),
  price_override_cents INTEGER CHECK (price_override_cents IS NULL OR price_override_cents >= 0),
  customization_override INTEGER NOT NULL DEFAULT 0 CHECK (customization_override IN (0,1)),
  FOREIGN KEY (kitchen_id,dish_id) REFERENCES dishes(kitchen_id,id),
  UNIQUE (kitchen_id,dish_id,offer_date,delivery_time),
  CHECK (pickup_until > delivery_time),
  CHECK ((CAST(substr(pickup_until,1,2) AS INTEGER)*60 + CAST(substr(pickup_until,4,2) AS INTEGER)) - (CAST(substr(delivery_time,1,2) AS INTEGER)*60 + CAST(substr(delivery_time,4,2) AS INTEGER)) <= 60)
);
INSERT INTO offers_new (id,kitchen_id,dish_id,offer_date,delivery_time,pickup_until,booking_deadline_at,capacity,reserved_count,sort_order,published_at,sold_out_at,description_override,price_override_cents,customization_override)
SELECT id,kitchen_id,dish_id,offer_date,delivery_time,pickup_until,booking_deadline_at,capacity,reserved_count,sort_order,published_at,sold_out_at,description_override,price_override_cents,customization_override FROM offers;
DROP TABLE offers;
ALTER TABLE offers_new RENAME TO offers;
CREATE INDEX offers_date_idx ON offers(offer_date,delivery_time);
CREATE INDEX offers_booking_deadline_idx ON offers(booking_deadline_at);
CREATE INDEX offers_kitchen_date_idx ON offers(kitchen_id,offer_date,delivery_time);
