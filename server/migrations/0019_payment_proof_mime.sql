ALTER TABLE payment_checkouts ADD COLUMN proof_declared_mime TEXT;
UPDATE payment_checkouts SET proof_content=NULL,proof_mime=NULL WHERE status='approved';
