-- No-show protection: per-service deposit configuration. A deposit invoice
-- auto-generates at booking time when deposit_type != 'none' (lib/deposits.ts).
ALTER TABLE services ADD COLUMN deposit_type TEXT NOT NULL DEFAULT 'none' CHECK (deposit_type IN ('none','fixed','percentage'));
ALTER TABLE services ADD COLUMN deposit_value REAL NOT NULL DEFAULT 0;

-- Distinguishes auto-created deposit invoices from normal ones in the UI.
ALTER TABLE invoices ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard','deposit'));

-- Tracks which Embedded Signup path a tenant completed (Meta's WhatsApp
-- Business app + Cloud API coexistence vs a fresh Cloud-API-only number).
ALTER TABLE tenants ADD COLUMN onboarding_type TEXT CHECK (onboarding_type IS NULL OR onboarding_type IN ('coexistence','new_number'));

-- Loyalty milestone counter, incremented on booking completion.
ALTER TABLE customers ADD COLUMN completed_bookings_count INTEGER NOT NULL DEFAULT 0;
