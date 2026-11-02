CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions(user_id);
CREATE INDEX orders_push_pending_idx ON orders(offer_date,status,fulfillment_status);

CREATE TABLE push_reminders (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  claimed_at TEXT NOT NULL,
  sent_at TEXT,
  PRIMARY KEY (order_id, subscription_id)
);
