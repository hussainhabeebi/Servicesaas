import { eq } from "drizzle-orm";
import { createDb, schema } from "../db/client";

/**
 * WhatsApp is transported through a self-hosted Chatwoot instance shared
 * across tenants: each tenant gets a dedicated WhatsApp number provisioned
 * by ops and connected as its own Chatwoot inbox (see
 * admin.ts's PATCH /admin/tenants/:id/chatwoot-inbox). `chatwoot_inbox_id`
 * on the tenant row is the routing key inbound webhooks carry — the
 * equivalent of the old shared-WABA phone_number_id mapping.
 *
 * One platform-level agent API token (CHATWOOT_API_TOKEN) sends on behalf
 * of any inbox in the account — Chatwoot's API is account-scoped, not
 * inbox-scoped, so a single token covers every tenant.
 */
export interface ChatwootConfig {
  baseUrl: string; // e.g. "https://app.aiingo.com" — no trailing slash
  apiAccessToken: string;
  accountId: string;
}

export async function resolveTenantByChatwootInboxId(db: D1Database, inboxId: number): Promise<string | null> {
  const drizzleDb = createDb(db);
  const [row] = await drizzleDb
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.chatwoot_inbox_id, inboxId))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Chatwoot doesn't sign webhook payloads the way Meta does, so the shared
 * secret is embedded in the webhook URL itself (configured on the Chatwoot
 * side as .../webhooks/chatwoot?token=<CHATWOOT_WEBHOOK_TOKEN>) and checked
 * here on every inbound call.
 */
export function verifyChatwootWebhookToken(providedToken: string | null, expectedToken: string): boolean {
  if (!providedToken || providedToken.length !== expectedToken.length) return false;
  let diff = 0;
  for (let i = 0; i < providedToken.length; i++) diff |= providedToken.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  return diff === 0;
}

async function chatwootFetch(config: ChatwootConfig, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${config.baseUrl}/api/v1/accounts/${config.accountId}${path}`, {
    ...init,
    headers: { api_access_token: config.apiAccessToken, "Content-Type": "application/json", ...init?.headers },
  });
}

/** Replies within an existing conversation — used by the bot when responding to an inbound webhook. */
export async function sendChatwootReply(
  config: ChatwootConfig,
  conversationId: number,
  content: string
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  const res = await chatwootFetch(config, `/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, message_type: "outgoing" }),
  });
  if (!res.ok) return { ok: false, error: await res.text() };
  const json = (await res.json()) as { id: number };
  return { ok: true, messageId: json.id };
}

async function findOrCreateContact(config: ChatwootConfig, inboxId: number, phone: string, name: string): Promise<number | null> {
  const searchRes = await chatwootFetch(config, `/contacts/search?q=${encodeURIComponent(phone)}`);
  if (searchRes.ok) {
    const searchJson = (await searchRes.json()) as { payload?: Array<{ id: number; phone_number?: string }> };
    const existing = searchJson.payload?.find((c) => c.phone_number === phone);
    if (existing) return existing.id;
  }

  const createRes = await chatwootFetch(config, `/contacts`, {
    method: "POST",
    body: JSON.stringify({ name, phone_number: phone, inbox_id: inboxId }),
  });
  if (!createRes.ok) return null;
  const createJson = (await createRes.json()) as { payload?: { contact?: { id: number } } };
  return createJson.payload?.contact?.id ?? null;
}

async function findOrCreateConversation(config: ChatwootConfig, inboxId: number, contactId: number): Promise<number | null> {
  const res = await chatwootFetch(config, `/conversations`, {
    method: "POST",
    body: JSON.stringify({ source_id: `contact_${contactId}`, inbox_id: inboxId, contact_id: contactId }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: number };
  return json.id ?? null;
}

/**
 * Proactive send (invoice delivery, review requests, reminders) — no
 * inbound webhook to reply to, so find-or-create the contact and
 * conversation on the tenant's inbox first.
 */
export async function sendChatwootProactiveMessage(
  config: ChatwootConfig,
  inboxId: number,
  phone: string,
  name: string,
  content: string
): Promise<{ ok: boolean; error?: string }> {
  const contactId = await findOrCreateContact(config, inboxId, phone, name);
  if (!contactId) return { ok: false, error: "Could not find/create Chatwoot contact" };
  const conversationId = await findOrCreateConversation(config, inboxId, contactId);
  if (!conversationId) return { ok: false, error: "Could not find/create Chatwoot conversation" };
  return sendChatwootReply(config, conversationId, content);
}

/** Fetches an inbound attachment (voice note / photo) from Chatwoot's storage. */
export async function downloadChatwootAttachment(dataUrl: string, apiAccessToken: string): Promise<ArrayBuffer | null> {
  const res = await fetch(dataUrl, { headers: { api_access_token: apiAccessToken } });
  if (!res.ok) return null;
  return res.arrayBuffer();
}
