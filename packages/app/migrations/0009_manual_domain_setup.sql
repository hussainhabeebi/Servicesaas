-- Adds the free "move domain to Cloudflare zone" path as an alternative to
-- the Cloudflare-for-SaaS Custom Hostname flow (which needs the account's
-- Fallback Origin configured and is fiddlier to get right). A 'manual' domain
-- is one where the tenant points their registrar's nameservers straight at
-- Cloudflare and DNS/Workers Routes are set up by hand in that new zone —
-- our side just tracks the row and lets ops/tenant flip it to 'active' once
-- they've verified it resolves. SQLite can't alter a CHECK constraint in
-- place, so rebuild both tables.

CREATE TABLE domains_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  domain TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'subdomain' CHECK (type IN ('subdomain','custom','manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verifying','active','error','manual_pending')),
  cf_hostname_id TEXT,
  ssl_status TEXT,
  dns_records TEXT,
  error_message TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO domains_new SELECT id, tenant_id, domain, type, status, cf_hostname_id, ssl_status, dns_records, error_message, last_checked_at, created_at FROM domains;
DROP TABLE domains;
ALTER TABLE domains_new RENAME TO domains;
CREATE INDEX domains_tenant_idx ON domains(tenant_id);
CREATE UNIQUE INDEX domains_domain_idx ON domains(domain);

CREATE TABLE admin_audit_log_new (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id),
  action TEXT NOT NULL CHECK (action IN ('reset_tenant_password','impersonate_tenant','edit_tenant_site','publish_tenant_site','add_tenant_domain','activate_tenant_domain')),
  target_tenant_id TEXT REFERENCES tenants(id),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO admin_audit_log_new SELECT id, admin_user_id, action, target_tenant_id, detail, created_at FROM admin_audit_log;
DROP TABLE admin_audit_log;
ALTER TABLE admin_audit_log_new RENAME TO admin_audit_log;
CREATE INDEX admin_audit_log_admin_idx ON admin_audit_log(admin_user_id);
CREATE INDEX admin_audit_log_tenant_idx ON admin_audit_log(target_tenant_id);
