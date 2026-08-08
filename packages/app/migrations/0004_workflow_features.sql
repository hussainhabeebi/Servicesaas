-- Self-serve billing state on tenants (not automated collection — see schema.ts note)
ALTER TABLE tenants ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active','past_due','cancelled'));
ALTER TABLE tenants ADD COLUMN next_billing_date TEXT;

-- Team logins linked to operational staff/crew records (no shared passwords)
ALTER TABLE tenant_users ADD COLUMN staff_id TEXT REFERENCES staff(id);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  booking_id TEXT REFERENCES bookings(id),
  assigned_staff_id TEXT REFERENCES staff(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('job_reminder','follow_up','general')),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX tasks_tenant_idx ON tasks(tenant_id);
CREATE INDEX tasks_tenant_status_idx ON tasks(tenant_id, status);

CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  referring_customer_id TEXT NOT NULL REFERENCES customers(id),
  referred_name TEXT,
  referred_phone TEXT,
  referred_customer_id TEXT REFERENCES customers(id),
  reward_status TEXT NOT NULL DEFAULT 'pending' CHECK (reward_status IN ('pending','granted')),
  reward_description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX referrals_tenant_idx ON referrals(tenant_id);

CREATE TABLE vendor_bills (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  vendor_name TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid')),
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX vendor_bills_tenant_idx ON vendor_bills(tenant_id);

CREATE TABLE calendar_connections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  provider TEXT NOT NULL CHECK (provider IN ('google','cal_com')),
  access_token TEXT,
  refresh_token TEXT,
  external_calendar_id TEXT,
  connected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX calendar_connections_tenant_idx ON calendar_connections(tenant_id);
CREATE UNIQUE INDEX calendar_connections_staff_provider_idx ON calendar_connections(staff_id, provider);
