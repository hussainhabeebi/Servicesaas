import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/** Referral tracking (spec: "Review Requests & Referrals"). Kept simple — manual tracking, no auto-matching against new signups. */
export const referralsRoute = new Hono<AppContext>();

const referralSchema = z.object({
  referring_customer_id: z.string(),
  referred_name: z.string().optional(),
  referred_phone: z.string().optional(),
  reward_description: z.string().optional(),
});

referralsRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.referrals).where(eq(schema.referrals.tenant_id, c.get("tenantId")));
  return c.json({ referrals: rows });
});

referralsRoute.post("/", async (c) => {
  const parsed = referralSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(schema.referrals).values({ id, tenant_id: c.get("tenantId"), ...parsed.data });
  return c.json({ id }, 201);
});

const grantSchema = z.object({ referred_customer_id: z.string().optional() });

referralsRoute.patch("/:id/grant", async (c) => {
  const parsed = grantSchema.safeParse(await c.req.json().catch(() => ({})));
  const db = createDb(c.env.DB);
  await db
    .update(schema.referrals)
    .set({ reward_status: "granted", referred_customer_id: parsed.success ? parsed.data.referred_customer_id : undefined })
    .where(and(eq(schema.referrals.id, c.req.param("id")), eq(schema.referrals.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
