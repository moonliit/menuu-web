UPDATE offers
SET reserved_count = COALESCE((
  SELECT SUM(i.quantity)
  FROM order_items i JOIN orders r ON r.id=i.order_id
  WHERE i.offer_id=offers.id AND r.status='reservado' AND r.fulfillment_status<>'no_show'
), 0),
sold_out_at = CASE
  WHEN COALESCE((
    SELECT SUM(i.quantity)
    FROM order_items i JOIN orders r ON r.id=i.order_id
    WHERE i.offer_id=offers.id AND r.status='reservado' AND r.fulfillment_status<>'no_show'
  ), 0) >= capacity THEN sold_out_at
  ELSE NULL
END
WHERE EXISTS (
  SELECT 1 FROM order_items i JOIN orders r ON r.id=i.order_id
  WHERE i.offer_id=offers.id AND r.fulfillment_status='no_show'
);
