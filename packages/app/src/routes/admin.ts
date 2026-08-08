import { Hono } from "hono";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/** Cross-tenant ops endpoints for the internal /admin dashboard. Callers must hold the "admin" role (see index.ts wiring). */
export const adminRoute = new Hono<AppContext>();

adminRoute.get("/tenants", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.tenants).orderBy(desc(schema.tenants.created_at));
  return c.json({ tenants: rows });
});

adminRoute.get("/tenants/:id", async (c) => {
  const db = createDb(c.env.DB);
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, c.req.param("id"))).limit(1);
  if (!tenant) return c.json({ error: "Not found" }, 404);

  const [bookingCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.bookings).where(eq(schema.bookings.tenant_id, tenant.id));
  const [customerCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.customers).where(eq(schema.customers.tenant_id, tenant.id));
  const [revenue] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(schema.payments).where(eq(schema.payments.tenant_id, tenant.id));

  return c.json({
    tenant,
    stats: { bookings: bookingCount?.count ?? 0, customers: customerCount?.count ?? 0, lifetimeRevenue: revenue?.total ?? 0 },
  });
});

const statusSchema = z.object({ status: z.enum(["active", "suspended", "cancelled"]) });

adminRoute.patch("/tenants/:id/status", async (c) => {
  const parsed = statusSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db.update(schema.tenants).set({ status: parsed.data.status, updated_at: new Date().toISOString() }).where(eq(schema.tenants.id, c.req.param("id")));
  return c.json({ ok: true });
});

const planSchema = z.object({ plan: z.enum(["starter", "growth"]) });

adminRoute.patch("/tenants/:id/plan", async (c) => {
  const parsed = planSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db.update(schema.tenants).set({ plan: parsed.data.plan, updated_at: new Date().toISOString() }).where(eq(schema.tenants.id, c.req.param("id")));
  return c.json({ ok: true });
});

/**
 * Manual override for WhatsApp connection (spec §1/§5) — self-serve via
 * Meta Embedded Signup (POST /api/whatsapp/connect) is the primary path;
 * this exists for ops to fix up a tenant's Chatwoot account/inbox/number
 * directly when self-serve isn't possible or needs correcting.
 */
const chatwootInboxSchema = z.object({
  chatwoot_account_id: z.number().int().positive(),
  chatwoot_inbox_id: z.number().int().positive(),
  whatsapp_number: z.string().min(6),
});

adminRoute.patch("/tenants/:id/chatwoot-inbox", async (c) => {
  const parsed = chatwootInboxSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.tenants)
    .set({
      chatwoot_account_id: parsed.data.chatwoot_account_id,
      chatwoot_inbox_id: parsed.data.chatwoot_inbox_id,
      whatsapp_number: parsed.data.whatsapp_number,
      updated_at: new Date().toISOString(),
    })
    .where(eq(schema.tenants.id, c.req.param("id")));
  return c.json({ ok: true });
});

adminRoute.get("/stats/platform", async (c) => {
  const db = createDb(c.env.DB);
  const [tenantCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.tenants);
  const [activeCount] = await db.select({ count: sql<number>`count(*)` }).from(schema.tenants).where(eq(schema.tenants.status, "active"));
  const [totalRevenue] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(schema.payments).where(eq(schema.payments.status, "success"));
  return c.json({ totalTenants: tenantCount?.count ?? 0, activeTenants: activeCount?.count ?? 0, platformRevenue: totalRevenue?.total ?? 0 });
});
