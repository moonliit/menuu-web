ALTER TABLE order_items ADD COLUMN delivered_quantity INTEGER CHECK (delivered_quantity IS NULL OR delivered_quantity >= 1);
UPDATE order_items SET delivered_quantity=quantity WHERE order_id IN (SELECT id FROM orders WHERE fulfillment_status='delivered');
