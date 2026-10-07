import { Hono } from "hono";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { invitationHash } from "./customer-auth";

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
  if (c.get("tenantRole") === "staff") {
    const assigned = await db.select({ customer_id: schema.bookings.customer_id }).from(schema.bookings).where(and(eq(schema.bookings.tenant_id, c.get("tenantId")), eq(schema.bookings.staff_id, c.get("staffId")!)));
    const ids = assigned.map(b => b.customer_id);
    const customers = ids.length ? await db.select({ id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone }).from(schema.customers).where(and(eq(schema.customers.tenant_id, c.get("tenantId")), inArray(schema.customers.id, ids))) : [];
    return c.json({ customers });
  }
  const rows = await db.select().from(schema.customers).where(eq(schema.customers.tenant_id, c.get("tenantId")));
  return c.json({ customers: rows });
});

/** The owner shares this one-use link with the verified customer; no messages are sent automatically. */
customersRoute.post("/:id/portal-invite", async (c) => {
  c.header("Cache-Control", "no-store");
  if (c.get("tenantRole") === "staff") return c.json({ error: "Owner access required" }, 403);
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, c.req.param("id")), eq(schema.customers.tenant_id, tenantId))).limit(1);
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!customer || !tenant) return c.json({ error: "Not found" }, 404);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  const data = { invitation_hash: await invitationHash(token), invitation_expires_at: new Date(Date.now() + 86400000).toISOString(), updated_at: new Date().toISOString() };
  await db.insert(schema.customerAccounts).values({ id: crypto.randomUUID(), tenant_id: tenantId, customer_id: customer.id, ...data }).onConflictDoUpdate({ target: [schema.customerAccounts.tenant_id, schema.customerAccounts.customer_id], set: data });
  return c.json({ activationUrl: `https://${tenant.subdomain}/login#invite=${token}`, expiresAt: data.invitation_expires_at });
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
