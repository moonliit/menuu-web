ALTER TABLE orders ADD COLUMN delivered_at TEXT;
UPDATE orders SET delivered_at=COALESCE(
  (SELECT e.created_at FROM kitchen_reservation_events e WHERE e.order_id=orders.id AND e.action='deliver' ORDER BY e.created_at DESC LIMIT 1),
  (SELECT e.created_at FROM kitchen_reservation_events e WHERE e.order_id=orders.id AND e.action='manual_add' ORDER BY e.created_at DESC LIMIT 1)
) WHERE status='reservado' AND fulfillment_status='delivered';
UPDATE orders SET created_at=delivered_at
WHERE status='reservado' AND fulfillment_status='delivered' AND delivered_at IS NOT NULL
  AND julianday(created_at) >= julianday(offer_date || 'T' || pickup_until || ':00-05:00')
  AND EXISTS(SELECT 1 FROM kitchen_reservation_events e WHERE e.order_id=orders.id AND e.action='manual_add');
