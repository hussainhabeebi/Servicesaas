import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/** Enquiry -> quoted -> booked -> closed pipeline, with Hot/Warm/Neutral/Cold mood tagging (spec §2, §3, §6). */
export const leadsRoute = new Hono<AppContext>();

const leadSchema = z.object({
  customer_name: z.string().optional(),
  phone: z.string().min(6),
  service_interest: z.string().optional(),
  area: z.string().optional(),
  mood: z.enum(["hot", "warm", "neutral", "cold"]).default("neutral"),
  source: z.enum(["whatsapp", "website", "ads", "manual"]).default("manual"),
  notes: z.string().optional(),
});

leadsRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const { status, mood } = c.req.query();
  const conditions = [eq(schema.leads.tenant_id, c.get("tenantId"))];
  if (status) conditions.push(eq(schema.leads.status, status));
  if (mood) conditions.push(eq(schema.leads.mood, mood));
  const rows = await db.select().from(schema.leads).where(and(...conditions));
  return c.json({ leads: rows });
});

leadsRoute.post("/", async (c) => {
  const parsed = leadSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(schema.leads).values({ id, tenant_id: c.get("tenantId"), ...parsed.data });
  return c.json({ id }, 201);
});

const updateSchema = z.object({
  mood: z.enum(["hot", "warm", "neutral", "cold"]).optional(),
  status: z.enum(["open", "quoted", "booked", "closed"]).optional(),
  notes: z.string().optional(),
});

leadsRoute.patch("/:id", async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.leads)
    .set({ ...parsed.data, updated_at: new Date().toISOString() })
    .where(and(eq(schema.leads.id, c.req.param("id")), eq(schema.leads.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

const convertSchema = z.object({ customer_id: z.string(), booking_id: z.string() });

leadsRoute.post("/:id/convert", async (c) => {
  const parsed = convertSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.leads)
    .set({ status: "booked", converted_booking_id: parsed.data.booking_id, updated_at: new Date().toISOString() })
    .where(and(eq(schema.leads.id, c.req.param("id")), eq(schema.leads.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
