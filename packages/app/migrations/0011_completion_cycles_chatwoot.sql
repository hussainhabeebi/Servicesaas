ALTER TABLE tenants ADD COLUMN chatwoot_token_encrypted TEXT;
ALTER TABLE customers ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';
CREATE TABLE service_completions (
 booking_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
 invoice_id TEXT NOT NULL, service_date TEXT NOT NULL, amount REAL NOT NULL,
 notification_status TEXT NOT NULL DEFAULT 'pending', notification_error TEXT, notification_attempt_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX completions_customer ON service_completions(tenant_id, customer_id, service_date);
