import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

export const staffRoute = new Hono<AppContext>();

const staffSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  role: z.string().default("technician"),
  color: z.string().default("#4F46E5"),
  active: z.boolean().default(true),
  // Neighbourhoods/zones this staff member covers — empty/omitted means
  // they cover every area (see lib/staff-matching.ts). Free text, same
  // convention as leads.area / customer_addresses.area.
  service_areas: z.array(z.string().min(1)).default([]),
});

const availabilitySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

staffRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.staff).where(eq(schema.staff.tenant_id, c.get("tenantId")));
  return c.json({ staff: rows });
});

staffRoute.post("/", async (c) => {
  const parsed = staffSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(schema.staff).values({ id, tenant_id: c.get("tenantId"), ...parsed.data });
  return c.json({ id }, 201);
});

staffRoute.patch("/:id", async (c) => {
  const parsed = staffSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.staff)
    .set({ ...parsed.data, updated_at: new Date().toISOString() })
    .where(and(eq(schema.staff.id, c.req.param("id")), eq(schema.staff.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

staffRoute.post("/:id/availability", async (c) => {
  const parsed = availabilitySchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db
    .insert(schema.staffAvailability)
    .values({ id, tenant_id: c.get("tenantId"), staff_id: c.req.param("id"), ...parsed.data });
  return c.json({ id }, 201);
});

staffRoute.get("/:id/availability", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.staffAvailability)
    .where(
      and(eq(schema.staffAvailability.staff_id, c.req.param("id")), eq(schema.staffAvailability.tenant_id, c.get("tenantId")))
    );
  return c.json({ availability: rows });
});

staffRoute.delete("/:id/availability/:availabilityId", async (c) => {
  const db = createDb(c.env.DB);
  await db
    .delete(schema.staffAvailability)
    .where(
      and(
        eq(schema.staffAvailability.id, c.req.param("availabilityId")),
        eq(schema.staffAvailability.staff_id, c.req.param("id")),
        eq(schema.staffAvailability.tenant_id, c.get("tenantId"))
      )
    );
  return c.json({ ok: true });
});
