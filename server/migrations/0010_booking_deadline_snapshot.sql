ALTER TABLE order_items ADD COLUMN booking_deadline_at TEXT;
UPDATE order_items SET booking_deadline_at=(SELECT booking_deadline_at FROM offers WHERE offers.id=order_items.offer_id);
