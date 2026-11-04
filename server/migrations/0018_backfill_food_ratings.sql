-- Older kitchen-only reviews did not have item ratings. Preserve their score
-- for each ordered dish while keeping any existing dish ratings intact.
INSERT OR IGNORE INTO order_item_reviews (order_item_id, order_id, food_rating)
SELECT i.id, i.order_id, r.kitchen_rating
FROM order_items i
JOIN order_reviews r ON r.order_id = i.order_id;
