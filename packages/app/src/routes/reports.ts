import { Hono } from "hono";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/**
 * Team Performance Reports + Financial Planning (AR aging) — kept as
 * straightforward aggregate queries, not a separate analytics pipeline.
 * Leads aren't assigned to individual staff in this schema (the WhatsApp
 * bot is one shared front door per tenant, not per-staff), so win rate is
 * tenant-wide; jobs-completed is genuinely per-staff via bookings.staff_id.
 */
export const reportsRoute = new Hono<AppContext>();

reportsRoute.get("/team-performance", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const { from, to } = c.req.query();

  const staffRows = await db.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff).where(eq(schema.staff.tenant_id, tenantId));

  const results = await Promise.all(
    staffRows.map(async (s) => {
      const conditions = [eq(schema.bookings.tenant_id, tenantId), eq(schema.bookings.staff_id, s.id)];
      if (from) conditions.push(gte(schema.bookings.scheduled_start, from));
      if (to) conditions.push(lte(schema.bookings.scheduled_start, to));

      const [completed] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.bookings)
        .where(and(...conditions, eq(schema.bookings.status, "completed")));
      const [scheduled] = await db.select({ count: sql<number>`count(*)` }).from(schema.bookings).where(and(...conditions));
      const [cancelled] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.bookings)
        .where(and(...conditions, eq(schema.bookings.status, "cancelled")));

      return {
        staffId: s.id,
        staffName: s.name,
        jobsScheduled: scheduled?.count ?? 0,
        jobsCompleted: completed?.count ?? 0,
        jobsCancelled: cancelled?.count ?? 0,
      };
    })
  );

  return c.json({ teamPerformance: results });
});

reportsRoute.get("/win-rate", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const { from, to } = c.req.query();

  const conditions = [eq(schema.leads.tenant_id, tenantId)];
  if (from) conditions.push(gte(schema.leads.created_at, from));
  if (to) conditions.push(lte(schema.leads.created_at, to));

  const rows = await db.select({ status: schema.leads.status, count: sql<number>`count(*)` }).from(schema.leads).where(and(...conditions)).groupBy(schema.leads.status);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const booked = rows.find((r) => r.status === "booked")?.count ?? 0;

  return c.json({ byStatus: rows, totalLeads: total, winRate: total > 0 ? Math.round((booked / total) * 1000) / 10 : 0 });
});

/** AR aging — how much is owed, bucketed by how overdue it is. */
reportsRoute.get("/ar-aging", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");

  const rows = await db
    .select({ id: schema.invoices.id, invoice_number: schema.invoices.invoice_number, total: schema.invoices.total, amount_paid: schema.invoices.amount_paid, due_date: schema.invoices.due_date, customer_id: schema.invoices.customer_id })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.tenant_id, tenantId), sql`${schema.invoices.status} IN ('sent','partial','overdue')`));

  const now = Date.now();
  const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_60_plus: 0 };
  const items = rows.map((r) => {
    const outstanding = r.total - r.amount_paid;
    const daysOverdue = r.due_date ? Math.floor((now - new Date(r.due_date).getTime()) / 86_400_000) : -1;
    let bucket: keyof typeof buckets = "current";
    if (daysOverdue > 60) bucket = "days_60_plus";
    else if (daysOverdue > 30) bucket = "days_31_60";
    else if (daysOverdue > 0) bucket = "days_1_30";
    buckets[bucket] += outstanding;
    return { invoiceId: r.id, invoiceNumber: r.invoice_number, customerId: r.customer_id, outstanding, daysOverdue: Math.max(daysOverdue, 0), bucket };
  });

  return c.json({ buckets, items });
});
