import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

export const customersRoute = new Hono<AppContext>();

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  preferences: z.record(z.unknown()).default({}),
});

const addressSchema = z.object({
  label: z.string().default("Home"),
  address_line: z.string().min(1),
  area: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  is_default: z.boolean().default(false),
});

customersRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.customers).where(eq(schema.customers.tenant_id, c.get("tenantId")));
  return c.json({ customers: rows });
});

customersRoute.post("/", async (c) => {
  const parsed = customerSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(schema.customers).values({ id, tenant_id: c.get("tenantId"), ...parsed.data });
  return c.json({ id }, 201);
});

customersRoute.get("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const [customer] = await db
    .select()
    .from(schema.customers)
    .where(and(eq(schema.customers.id, c.req.param("id")), eq(schema.customers.tenant_id, c.get("tenantId"))))
    .limit(1);
  if (!customer) return c.json({ error: "Not found" }, 404);
  const addresses = await db
    .select()
    .from(schema.customerAddresses)
    .where(eq(schema.customerAddresses.customer_id, customer.id));
  const bookings = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.customer_id, customer.id), eq(schema.bookings.tenant_id, c.get("tenantId"))));
  return c.json({ customer, addresses, bookings });
});

customersRoute.patch("/:id", async (c) => {
  const parsed = customerSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.customers)
    .set({ ...parsed.data, updated_at: new Date().toISOString() })
    .where(and(eq(schema.customers.id, c.req.param("id")), eq(schema.customers.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

customersRoute.post("/:id/addresses", async (c) => {
  const parsed = addressSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db
    .insert(schema.customerAddresses)
    .values({ id, tenant_id: c.get("tenantId"), customer_id: c.req.param("id"), ...parsed.data });
  return c.json({ id }, 201);
});
