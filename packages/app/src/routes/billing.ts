import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/**
 * Self-serve billing (spec: "manage your own subscription/add-ons").
 * This is plan state + a change-plan action, not automated recurring
 * charge collection — none of the payment gateway wrappers in this repo
 * (Razorpay/PhonePe/Telr/Network International) support subscription
 * billing, only one-off payment links, so actually charging the tenant
 * each month needs a real platform-billing integration this pass doesn't
 * build. Track subscription_status manually (e.g. via admin) until then.
 */
export const billingRoute = new Hono<AppContext>();

const PLAN_PRICES: Record<string, number> = { starter: 99, growth: 199 };

billingRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const [tenant] = await db
    .select({ plan: schema.tenants.plan, subscription_status: schema.tenants.subscription_status, next_billing_date: schema.tenants.next_billing_date, currency: schema.tenants.currency })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, c.get("tenantId")))
    .limit(1);
  if (!tenant) return c.json({ error: "Not found" }, 404);
  return c.json({ ...tenant, monthlyPrice: PLAN_PRICES[tenant.plan] ?? null });
});

const planSchema = z.object({ plan: z.enum(["starter", "growth"]) });

billingRoute.patch("/plan", async (c) => {
  const parsed = planSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");

  const [tenant] = await db.select({ next_billing_date: schema.tenants.next_billing_date }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const nextBillingDate = tenant?.next_billing_date ?? new Date(Date.now() + 30 * 86_400_000).toISOString();

  await db.update(schema.tenants).set({ plan: parsed.data.plan, next_billing_date: nextBillingDate, updated_at: new Date().toISOString() }).where(eq(schema.tenants.id, tenantId));
  return c.json({ ok: true, plan: parsed.data.plan, monthlyPrice: PLAN_PRICES[parsed.data.plan] });
});
