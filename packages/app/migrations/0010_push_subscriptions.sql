-- Web Push subscriptions for tenant sites (site-engine) — booking reminders
-- and rebook nudges delivered as browser push notifications, independent of
-- the WhatsApp channel. One row per browser/device subscription; a customer
-- may hold several (multiple devices) so this isn't unique on customer_id.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT REFERENCES customers(id),
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX push_subscriptions_tenant_idx ON push_subscriptions(tenant_id);
CREATE INDEX push_subscriptions_customer_idx ON push_subscriptions(customer_id);
CREATE UNIQUE INDEX push_subscriptions_tenant_endpoint_idx ON push_subscriptions(tenant_id, endpoint);
