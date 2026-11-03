ALTER TABLE orders ADD COLUMN cancelled_at TEXT;
ALTER TABLE orders ADD COLUMN auto_no_show_at TEXT;
CREATE INDEX orders_pending_expiry_idx ON orders(offer_date,delivery_time) WHERE status='reservado' AND fulfillment_status='pending';
