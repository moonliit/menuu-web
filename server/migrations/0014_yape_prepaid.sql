CREATE TABLE payment_checkouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('awaiting_proof','under_review','approved','rejected','expired')),
  expires_at TEXT NOT NULL,
  proof_mime TEXT CHECK (proof_mime IN ('image/png','image/jpeg')),
  proof_content BLOB,
  proof_uploaded_at TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX payment_checkouts_user_idx ON payment_checkouts(user_id,created_at DESC);
CREATE INDEX payment_checkouts_review_idx ON payment_checkouts(status,created_at);
ALTER TABLE orders ADD COLUMN payment_checkout_id TEXT REFERENCES payment_checkouts(id);
CREATE INDEX orders_payment_checkout_idx ON orders(payment_checkout_id);
