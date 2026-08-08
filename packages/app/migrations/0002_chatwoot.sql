-- Replaces the shared-WABA phone_number_id routing with per-tenant Chatwoot
-- inbox routing: each tenant gets a dedicated WhatsApp number provisioned by
-- ops and connected as its own Chatwoot inbox, assigned via
-- PATCH /admin/tenants/:id/chatwoot-inbox.

ALTER TABLE tenants ADD COLUMN whatsapp_number TEXT;
ALTER TABLE tenants ADD COLUMN chatwoot_inbox_id INTEGER;
CREATE UNIQUE INDEX tenants_chatwoot_inbox_idx ON tenants(chatwoot_inbox_id);

ALTER TABLE whatsapp_conversations ADD COLUMN chatwoot_conversation_id INTEGER;

DROP TABLE wa_phone_mapping;
