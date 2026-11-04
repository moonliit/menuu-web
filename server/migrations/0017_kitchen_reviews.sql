ALTER TABLE order_reviews ADD COLUMN comment TEXT NOT NULL DEFAULT '' CHECK (length(comment) <= 100);
ALTER TABLE order_reviews ADD COLUMN banned_at TEXT;
ALTER TABLE order_reviews ADD COLUMN banned_by TEXT REFERENCES users(id);
ALTER TABLE orders ADD COLUMN review_prompt_seen_at TEXT;
UPDATE orders SET review_enabled=1 WHERE status='reservado' AND fulfillment_status='delivered';
CREATE INDEX order_reviews_visible_idx ON order_reviews(banned_at,created_at DESC);
CREATE INDEX orders_review_prompt_idx ON orders(user_id,fulfillment_status,review_prompt_seen_at);
CREATE TABLE review_moderation_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES order_reviews(order_id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('ban','restore')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX review_moderation_events_order_idx ON review_moderation_events(order_id,created_at);
