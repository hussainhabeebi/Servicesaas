import { eq } from "drizzle-orm";
import { createDb, schema } from "../db/client";

/**
 * WhatsApp is transported through a self-hosted Chatwoot instance, but each
 * tenant gets its own isolated Chatwoot Account (not a shared account with
 * per-tenant inboxes) — provisioned automatically the first time a tenant
 * completes Meta's Embedded Signup during onboarding (see
 * routes/whatsapp-connect.ts). Two Chatwoot credential types are involved:
 *
 * - A Platform API "Super Admin" token (CHATWOOT_PLATFORM_API_TOKEN), used
 *   only to create new Accounts and attach the platform Agent Bot to them.
 * - The platform Agent Bot's own access token (CHATWOOT_AGENT_BOT_TOKEN) —
 *   Chatwoot's supported pattern for a single credential that can act
 *   (send/receive messages, create inboxes) across every account it's been
 *   added to, so we don't need a distinct login/token per tenant.
 *
 * `chatwoot_inbox_id` on the tenant row is the routing key inbound webhooks
 * carry (inbox IDs are unique across the whole Chatwoot instance, not just
 * within an account); `chatwoot_account_id` is required alongside it for
 * every Account API call, since accounts are no longer shared.
 */
export interface ChatwootConfig {
  baseUrl: string; // e.g. "https://app.aiingo.com" — no trailing slash
  apiAccessToken: string; // the Agent Bot's token, for a specific account it's a member of
  accountId: number;
}

export interface ChatwootPlatformConfig {
  baseUrl: string;
  platformApiToken: string; // Super Admin token — account/agent-bot management only, not messaging
}

export async function resolveTenantByChatwootInboxId(
  db: D1Database,
  inboxId: number
): Promise<{ tenantId: string; accountId: number | null } | null> {
  const drizzleDb = createDb(db);
  const [row] = await drizzleDb
    .select({ id: schema.tenants.id, chatwoot_account_id: schema.tenants.chatwoot_account_id })
    .from(schema.tenants)
    .where(eq(schema.tenants.chatwoot_inbox_id, inboxId))
    .limit(1);
  if (!row) return null;
  return { tenantId: row.id, accountId: row.chatwoot_account_id };
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

async function platformFetch(config: ChatwootPlatformConfig, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${config.baseUrl}/platform/api/v1${path}`, {
    ...init,
    headers: { api_access_token: config.platformApiToken, "Content-Type": "application/json", ...init?.headers },
  });
}

// ---------------------------------------------------------------------------
// Account provisioning (Platform API) — run once per tenant, at WhatsApp
// connect time. NOTE: verify these endpoint shapes against your Chatwoot
// version before relying on them; Platform API / Agent Bot support has
// evolved across releases and isn't something this environment could test
// against a live instance.
// ---------------------------------------------------------------------------

/** Creates a new, isolated Chatwoot Account for a tenant. */
export async function createChatwootAccount(config: ChatwootPlatformConfig, tenantName: string): Promise<number | null> {
  const res = await platformFetch(config, "/accounts", { method: "POST", body: JSON.stringify({ name: tenantName }) });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: number };
  return json.id ?? null;
}

/**
 * Adds the platform Agent Bot to a tenant's new account, so the bot's one
 * access_token can act on that account without a separate per-tenant login.
 * agentBotId is the bot's numeric ID (not its token) — fetch once via
 * GET /platform/api/v1/agent_bots and store as CHATWOOT_AGENT_BOT_ID.
 */
export async function addAgentBotToAccount(config: ChatwootPlatformConfig, accountId: number, agentBotId: number): Promise<boolean> {
  const res = await platformFetch(config, `/accounts/${accountId}/agent_bots`, {
    method: "POST",
    body: JSON.stringify({ agent_bot: agentBotId }),
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// WhatsApp inbox creation via Meta Embedded Signup (regular Account API,
// authenticated as the Agent Bot now that it's a member of the account)
// ---------------------------------------------------------------------------

export interface EmbeddedSignupResult {
  code: string; // Meta OAuth code captured from the embedded signup widget's callback
  wabaId?: string;
  phoneNumberId?: string;
}

/**
 * Chatwoot's own configured Meta App (its FB_APP_ID/FB_APP_SECRET, not
 * ours) finishes the Embedded Signup OAuth exchange server-side once we
 * hand it the code + identifiers captured from the widget.
 */
export async function createWhatsAppCloudInbox(
  config: ChatwootConfig,
  inboxName: string,
  signup: EmbeddedSignupResult
): Promise<{ inboxId: number; phoneNumber?: string } | null> {
  const res = await chatwootFetch(config, "/inboxes", {
    method: "POST",
    body: JSON.stringify({
      name: inboxName,
      channel: {
        type: "whatsapp",
        provider: "whatsapp_cloud",
        provider_config: { source: "embedded_signup", code: signup.code, business_account_id: signup.wabaId, phone_number_id: signup.phoneNumberId },
      },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { id?: number; phone_number?: string };
  if (!json.id) return null;
  return { inboxId: json.id, phoneNumber: json.phone_number };
}

/** Points the new account's webhook at our inbound handler so message_created events reach /webhooks/chatwoot. */
export async function registerAccountWebhook(config: ChatwootConfig, webhookUrl: string): Promise<boolean> {
  const res = await chatwootFetch(config, "/webhooks", { method: "POST", body: JSON.stringify({ url: webhookUrl, subscriptions: ["message_created"] }) });
  return res.ok;
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

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
