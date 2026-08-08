import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/** Accounts payable — vendor bills, separate from the per-job `expenses` table (spec: "Accounting: invoices, expenses, vendor bills"). */
export const vendorBillsRoute = new Hono<AppContext>();

const billSchema = z.object({
  vendor_name: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().positive(),
  due_date: z.string().optional(),
});

vendorBillsRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const { status } = c.req.query();
  const conditions = [eq(schema.vendorBills.tenant_id, c.get("tenantId"))];
  if (status) conditions.push(eq(schema.vendorBills.status, status));
  const rows = await db.select().from(schema.vendorBills).where(and(...conditions));
  return c.json({ vendorBills: rows });
});

vendorBillsRoute.post("/", async (c) => {
  const parsed = billSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(schema.vendorBills).values({ id, tenant_id: c.get("tenantId"), ...parsed.data });
  return c.json({ id }, 201);
});

vendorBillsRoute.patch("/:id/pay", async (c) => {
  const db = createDb(c.env.DB);
  await db
    .update(schema.vendorBills)
    .set({ status: "paid", paid_at: new Date().toISOString() })
    .where(and(eq(schema.vendorBills.id, c.req.param("id")), eq(schema.vendorBills.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
