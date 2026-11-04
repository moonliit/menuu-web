ALTER TABLE orders ADD COLUMN fridge_at TEXT;
ALTER TABLE orders ADD COLUMN fridge_phone TEXT;
ALTER TABLE orders ADD COLUMN fridge_image_mime TEXT;
ALTER TABLE orders ADD COLUMN fridge_image BLOB;
ALTER TABLE orders ADD COLUMN fridge_image_expires_at TEXT;
CREATE INDEX orders_fridge_cleanup_idx ON orders(fridge_image_expires_at) WHERE fridge_image IS NOT NULL;
