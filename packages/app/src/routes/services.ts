import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

export const servicesRoute = new Hono<AppContext>();

const serviceSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  duration_minutes: z.number().int().positive().default(60),
  price: z.number().nonnegative().default(0),
  description: z.string().optional(),
  recurrence_options: z.array(z.enum(["weekly", "biweekly", "monthly"])).default([]),
});

servicesRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.services).where(eq(schema.services.tenant_id, c.get("tenantId")));
  return c.json({ services: rows });
});

servicesRoute.post("/", async (c) => {
  const parsed = serviceSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(schema.services).values({ id, tenant_id: c.get("tenantId"), ...parsed.data });
  return c.json({ id }, 201);
});

servicesRoute.patch("/:id", async (c) => {
  const parsed = serviceSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.services)
    .set({ ...parsed.data, updated_at: new Date().toISOString() })
    .where(and(eq(schema.services.id, c.req.param("id")), eq(schema.services.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

servicesRoute.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  await db
    .update(schema.services)
    .set({ active: false })
    .where(and(eq(schema.services.id, c.req.param("id")), eq(schema.services.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
