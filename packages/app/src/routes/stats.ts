import { Hono } from "hono";
import { and, eq, gte, lte } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { rollupDailyStatsForTenant } from "../lib/rollup";

/** Powers the "Today" home screen (spec §11) and the daily_stats/cash-flow reporting (spec §2, §10). */
export const statsRoute = new Hono<AppContext>();

function todayRange(timezoneOffsetMinutes = 240 /* Asia/Dubai UTC+4, no DST */) {
  const now = new Date(Date.now() + timezoneOffsetMinutes * 60_000);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 3_600_000);
  return {
    startIso: new Date(start.getTime() - timezoneOffsetMinutes * 60_000).toISOString(),
    endIso: new Date(end.getTime() - timezoneOffsetMinutes * 60_000).toISOString(),
  };
}

statsRoute.get("/today", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const { startIso, endIso } = todayRange();

  const bookings = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), gte(schema.bookings.scheduled_start, startIso), lte(schema.bookings.scheduled_start, endIso)));

  const paidToday = await db
    .select({ amount: schema.payments.amount })
    .from(schema.payments)
    .where(and(eq(schema.payments.tenant_id, tenantId), eq(schema.payments.status, "success"), gte(schema.payments.paid_at, startIso), lte(schema.payments.paid_at, endIso)));

  const moneyIn = paidToday.reduce((sum, p) => sum + p.amount, 0);

  const overdueInvoices = await db
    .select({ total: schema.invoices.total, amount_paid: schema.invoices.amount_paid })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.tenant_id, tenantId), eq(schema.invoices.status, "overdue")));
  const moneyOwed = overdueInvoices.reduce((sum, i) => sum + (i.total - i.amount_paid), 0);

  return c.json({
    todaysBookings: bookings,
    moneyComingInToday: Math.round(moneyIn * 100) / 100,
    moneyOwedOverdue: Math.round(moneyOwed * 100) / 100,
  });
});

statsRoute.get("/daily", async (c) => {
  const db = createDb(c.env.DB);
  const { from, to } = c.req.query();
  const conditions = [eq(schema.dailyStats.tenant_id, c.get("tenantId"))];
  if (from) conditions.push(gte(schema.dailyStats.stat_date, from));
  if (to) conditions.push(lte(schema.dailyStats.stat_date, to));
  const rows = await db.select().from(schema.dailyStats).where(and(...conditions));
  return c.json({ dailyStats: rows });
});

/** Manual trigger for the same rollup the scheduled cron handler runs automatically each day. */
statsRoute.post("/rollup", async (c) => {
  const result = await rollupDailyStatsForTenant(c.env, c.get("tenantId"));
  return c.json({ ok: true, ...result });
});

/** "Money expected this week" — spec §10 cash-flow forecast, summed from confirmed upcoming bookings' service price. */
statsRoute.get("/cash-flow-forecast", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const now = new Date().toISOString();
  const weekOut = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();

  const rows = await db
    .select({ price: schema.services.price, scheduled_start: schema.bookings.scheduled_start })
    .from(schema.bookings)
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.service_id))
    .where(
      and(
        eq(schema.bookings.tenant_id, tenantId),
        eq(schema.bookings.status, "scheduled"),
        gte(schema.bookings.scheduled_start, now),
        lte(schema.bookings.scheduled_start, weekOut)
      )
    );

  const expected = rows.reduce((sum, r) => sum + r.price, 0);
  return c.json({ moneyExpectedThisWeek: Math.round(expected * 100) / 100, confirmedJobs: rows.length });
});
