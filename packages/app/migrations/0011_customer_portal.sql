CREATE TABLE customer_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  password_hash TEXT,
  invitation_hash TEXT,
  invitation_expires_at TEXT,
  session_version INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);
CREATE UNIQUE INDEX customer_accounts_customer_idx ON customer_accounts(tenant_id, customer_id);
CREATE UNIQUE INDEX customer_accounts_invitation_idx ON customer_accounts(invitation_hash);
ALTER TABLE tenant_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
