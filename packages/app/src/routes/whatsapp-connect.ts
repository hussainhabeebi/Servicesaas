import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  createDb,
  schema,
  createChatwootAccount,
  addAgentBotToAccount,
  createWhatsAppCloudInbox,
  registerAccountWebhook,
  type ChatwootConfig,
  type ChatwootPlatformConfig,
} from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/**
 * Self-serve WhatsApp connection step in onboarding: the tenant runs Meta's
 * Embedded Signup widget (frontend, not built in this repo yet — see
 * GET /config for what it needs), and this route turns the resulting code
 * into a fully provisioned, isolated Chatwoot Account + WhatsApp inbox for
 * that tenant.
 */
export const whatsappConnectRoute = new Hono<AppContext>();

/** Frontend needs these to initialize the Meta Embedded Signup widget — neither value is secret. */
whatsappConnectRoute.get("/config", (c) => {
  return c.json({ metaAppId: c.env.META_APP_ID, embeddedSignupConfigId: c.env.META_EMBEDDED_SIGNUP_CONFIG_ID });
});

/** So the app UI can show "connected" vs a connect prompt without re-running the widget. */
whatsappConnectRoute.get("/status", async (c) => {
  const db = createDb(c.env.DB);
  const [tenant] = await db
    .select({ whatsapp_number: schema.tenants.whatsapp_number, chatwoot_inbox_id: schema.tenants.chatwoot_inbox_id, onboarding_type: schema.tenants.onboarding_type })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, c.get("tenantId")))
    .limit(1);
  return c.json({
    connected: Boolean(tenant?.chatwoot_inbox_id),
    whatsappNumber: tenant?.whatsapp_number ?? null,
    onboardingType: tenant?.onboarding_type ?? null,
  });
});

const connectSchema = z.object({
  code: z.string().min(1),
  wabaId: z.string().optional(),
  phoneNumberId: z.string().optional(),
  phoneNumber: z.string().optional(), // E.164, if the widget surfaced it — otherwise taken from Chatwoot's inbox response
  // Which Embedded Signup completion event the widget saw — see the
  // FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING vs FINISH_ONLY_WABA handling in
  // apps/tenant's ConnectWhatsApp page. Meta decides which path a given
  // phone number is eligible for; the client just reports what happened.
  onboardingType: z.enum(["coexistence", "new_number"]).optional(),
});

whatsappConnectRoute.post("/connect", async (c) => {
  const parsed = connectSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!tenant) return c.json({ error: "Tenant not found" }, 404);

  const platformConfig: ChatwootPlatformConfig = { baseUrl: c.env.CHATWOOT_BASE_URL, platformApiToken: c.env.CHATWOOT_PLATFORM_API_TOKEN };
  const agentBotId = Number(c.env.CHATWOOT_AGENT_BOT_ID);

  let accountId = tenant.chatwoot_account_id;
  if (!accountId) {
    accountId = await createChatwootAccount(platformConfig, tenant.business_name);
    if (!accountId) return c.json({ error: "Could not create Chatwoot account" }, 502);
    await addAgentBotToAccount(platformConfig, accountId, agentBotId);
    // Best-effort: if this account already had the bot (re-connect flow), the call above may
    // no-op or error harmlessly — not fatal to the connect flow either way.
  }

  const chatwootConfig: ChatwootConfig = { baseUrl: c.env.CHATWOOT_BASE_URL, apiAccessToken: c.env.CHATWOOT_AGENT_BOT_TOKEN, accountId };

  const inbox = await createWhatsAppCloudInbox(chatwootConfig, `${tenant.business_name} WhatsApp`, {
    code: parsed.data.code,
    wabaId: parsed.data.wabaId,
    phoneNumberId: parsed.data.phoneNumberId,
  });
  if (!inbox) return c.json({ error: "Could not create WhatsApp inbox from embedded signup" }, 502);

  const webhookUrl = `${new URL(c.req.url).origin}/webhooks/chatwoot?token=${c.env.CHATWOOT_WEBHOOK_TOKEN}`;
  await registerAccountWebhook(chatwootConfig, webhookUrl);

  const whatsappNumber = parsed.data.phoneNumber ?? inbox.phoneNumber;
  await db
    .update(schema.tenants)
    .set({
      chatwoot_account_id: accountId,
      chatwoot_inbox_id: inbox.inboxId,
      whatsapp_number: whatsappNumber,
      onboarding_type: parsed.data.onboardingType ?? tenant.onboarding_type,
      updated_at: new Date().toISOString(),
    })
    .where(eq(schema.tenants.id, tenantId));

  return c.json({ ok: true, chatwootAccountId: accountId, chatwootInboxId: inbox.inboxId, whatsappNumber });
});
