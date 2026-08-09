-- Full-zone custom domain onboarding: alongside the existing Cloudflare for
-- SaaS CNAME flow (type='custom'), a domain can now be connected by
-- delegating its nameservers to Cloudflare as a real zone (type='zone') —
-- more reliable than a fallback-origin CNAME since Cloudflare terminates
-- SSL and edge-routes it directly instead of chaining through our zone's
-- custom-hostname validation. See packages/app/src/lib/domain-management.ts.
-- SQLite can't alter a CHECK constraint in place, so rebuild the table.
CREATE TABLE domains_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  domain TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'subdomain' CHECK (type IN ('subdomain','custom','zone')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verifying','active','error')),
  cf_hostname_id TEXT,
  cf_zone_id TEXT,
  name_servers TEXT,
  ssl_status TEXT,
  dns_records TEXT,
  error_message TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO domains_new (id, tenant_id, domain, type, status, cf_hostname_id, ssl_status, dns_records, error_message, last_checked_at, created_at)
  SELECT id, tenant_id, domain, type, status, cf_hostname_id, ssl_status, dns_records, error_message, last_checked_at, created_at FROM domains;
DROP TABLE domains;
ALTER TABLE domains_new RENAME TO domains;
CREATE INDEX domains_tenant_idx ON domains(tenant_id);
CREATE UNIQUE INDEX domains_domain_idx ON domains(domain);
