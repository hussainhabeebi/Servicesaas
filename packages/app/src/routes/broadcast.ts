import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createDb, schema, sendChatwootProactiveMessage } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/**
 * Bulk/campaign messaging (spec §2: "rate-limited WhatsApp broadcast").
 * Kept simple: a sequential send loop with a small delay between messages,
 * good for the audience sizes a single service business actually has
 * (dozens to low hundreds). A queue-based sender (Cloudflare Queues) would
 * be the next step if audiences grow into the thousands — not built here.
 */
export const broadcastRoute = new Hono<AppContext>();

const createSchema = z.object({
  name: z.string().min(1),
  message_template: z.string().min(1), // supports {{name}} placeholder
  audience_filter: z.object({ all: z.boolean().optional(), tags: z.array(z.string()).optional() }).default({}),
});

broadcastRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.broadcastCampaigns)
    .where(eq(schema.broadcastCampaigns.tenant_id, c.get("tenantId")))
    .orderBy(desc(schema.broadcastCampaigns.created_at));
  return c.json({ broadcasts: rows });
});

broadcastRoute.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(schema.broadcastCampaigns).values({ id, tenant_id: c.get("tenantId"), ...parsed.data });
  return c.json({ id }, 201);
});

broadcastRoute.post("/:id/send", async (c) => {
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const campaignId = c.req.param("id");

  const [campaign] = await db.select().from(schema.broadcastCampaigns).where(and(eq(schema.broadcastCampaigns.id, campaignId), eq(schema.broadcastCampaigns.tenant_id, tenantId))).limit(1);
  if (!campaign) return c.json({ error: "Not found" }, 404);
  if (campaign.status === "sent" || campaign.status === "sending") return c.json({ error: `Campaign already ${campaign.status}` }, 400);

  const [tenant] = await db.select({ chatwoot_account_id: schema.tenants.chatwoot_account_id, chatwoot_inbox_id: schema.tenants.chatwoot_inbox_id }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!tenant?.chatwoot_account_id || !tenant.chatwoot_inbox_id) return c.json({ error: "WhatsApp not connected for this tenant" }, 400);

  const filter = (campaign.audience_filter as { all?: boolean; tags?: string[] }) ?? {};
  const audience = await db.select().from(schema.customers).where(eq(schema.customers.tenant_id, tenantId));
  const recipients = filter.tags?.length
    ? audience.filter((cust) => (cust.tags as string[] | null)?.some((t) => filter.tags!.includes(t)))
    : audience;

  await db.update(schema.broadcastCampaigns).set({ status: "sending" }).where(eq(schema.broadcastCampaigns.id, campaignId));

  const chatwootConfig = { baseUrl: c.env.CHATWOOT_BASE_URL, apiAccessToken: c.env.CHATWOOT_AGENT_BOT_TOKEN, accountId: tenant.chatwoot_account_id };
  let sentCount = 0;
  for (const recipient of recipients) {
    const content = campaign.message_template.replace(/\{\{name\}\}/g, recipient.name);
    const result = await sendChatwootProactiveMessage(chatwootConfig, tenant.chatwoot_inbox_id, recipient.phone, recipient.name, content).catch(() => ({ ok: false }));
    if (result.ok) sentCount++;
    await new Promise((resolve) => setTimeout(resolve, 350)); // rate-limit — same batch:1+delay pattern as the shared platform's WA broadcast module
  }

  await db.update(schema.broadcastCampaigns).set({ status: "sent", sent_count: sentCount }).where(eq(schema.broadcastCampaigns.id, campaignId));
  return c.json({ ok: true, sentCount, audienceSize: recipients.length });
});
