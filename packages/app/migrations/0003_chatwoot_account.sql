-- Each tenant now gets its own Chatwoot Account (not a shared one with
-- per-tenant inboxes) via self-serve Meta Embedded Signup at onboarding —
-- see routes/whatsapp-connect.ts. Every Chatwoot API call is account-scoped,
-- so this is required alongside chatwoot_inbox_id.

ALTER TABLE tenants ADD COLUMN chatwoot_account_id INTEGER;
