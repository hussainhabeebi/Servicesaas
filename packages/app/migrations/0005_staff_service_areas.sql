-- Location-based staff availability (cleaning & similar on-site verticals):
-- staff cover specific areas/neighbourhoods, and bookings record the area
-- the job is in so booking creation can match the two. See
-- packages/app/src/lib/staff-matching.ts.

-- Empty array (the default) means "covers every area" — keeps existing
-- solo-operator / single-area tenants working with zero configuration.
ALTER TABLE staff ADD COLUMN service_areas TEXT NOT NULL DEFAULT '[]';

ALTER TABLE bookings ADD COLUMN area TEXT;

-- Widen tasks.type to add 'staff_assignment' (booking created with no crew
-- match for its area/slot). SQLite can't alter a CHECK constraint in place,
-- so rebuild the table.
CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  booking_id TEXT REFERENCES bookings(id),
  assigned_staff_id TEXT REFERENCES staff(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('job_reminder','follow_up','general','staff_assignment')),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO tasks_new SELECT id, tenant_id, booking_id, assigned_staff_id, title, description, type, due_at, status, created_at FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX tasks_tenant_idx ON tasks(tenant_id);
CREATE INDEX tasks_tenant_status_idx ON tasks(tenant_id, status);
