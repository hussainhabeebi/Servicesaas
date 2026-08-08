-- Brute-force lockout on tenant logins (routes/auth.ts) — nothing enforced
-- this before.
ALTER TABLE tenant_users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenant_users ADD COLUMN locked_until TEXT;

-- Real per-person admin accounts, replacing the single shared
-- ADMIN_API_TOKEN for day-to-day access. The static token becomes a
-- bootstrap-only credential for provisioning the first admin account — see
-- routes/admin-bootstrap.ts.
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX admin_users_email_idx ON admin_users(email);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL CHECK (action IN ('reset_tenant_password','impersonate_tenant')),
  target_tenant_id TEXT REFERENCES tenants(id),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX admin_audit_log_admin_idx ON admin_audit_log(admin_user_id);
CREATE INDEX admin_audit_log_tenant_idx ON admin_audit_log(target_tenant_id);
