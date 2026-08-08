-- Widen admin_audit_log.action to cover the new admin-side website/domain
-- support tools (SQLite can't alter a CHECK constraint in place, so rebuild).
CREATE TABLE admin_audit_log_new (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL CHECK (action IN ('reset_tenant_password','impersonate_tenant','edit_tenant_site','publish_tenant_site','add_tenant_domain')),
  target_tenant_id TEXT REFERENCES tenants(id),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO admin_audit_log_new SELECT id, admin_user_id, action, target_tenant_id, detail, created_at FROM admin_audit_log;
DROP TABLE admin_audit_log;
ALTER TABLE admin_audit_log_new RENAME TO admin_audit_log;
CREATE INDEX admin_audit_log_admin_idx ON admin_audit_log(admin_user_id);
CREATE INDEX admin_audit_log_tenant_idx ON admin_audit_log(target_tenant_id);
