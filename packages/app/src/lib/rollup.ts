import { and, eq, sql } from "drizzle-orm";
import { createDb, schema, type Env } from "@serviceos/platform";

function todayRange(timezoneOffsetMinutes = 240 /* Asia/Dubai UTC+4, no DST */) {
  const now = new Date(Date.now() + timezoneOffsetMinutes * 60_000);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 3_600_000);
  return {
    startIso: new Date(start.getTime() - timezoneOffsetMinutes * 60_000).toISOString(),
    endIso: new Date(end.getTime() - timezoneOffsetMinutes * 60_000).toISOString(),
    dateKey: start.toISOString().slice(0, 10),
  };
}

/** Rolls one tenant's raw activity for "today" into a daily_stats row. Shared by the /api/stats/rollup route and the scheduled cron handler. */
export async function rollupDailyStatsForTenant(env: Env, tenantId: string) {
  const db = createDb(env.DB);
  const { startIso, endIso, dateKey } = todayRange();

  const [messagesIn] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.whatsappMessages)
    .where(and(eq(schema.whatsappMessages.tenant_id, tenantId), eq(schema.whatsappMessages.direction, "in"), sql`${schema.whatsappMessages.created_at} >= ${startIso}`, sql`${schema.whatsappMessages.created_at} <= ${endIso}`));
  const [messagesOut] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.whatsappMessages)
    .where(and(eq(schema.whatsappMessages.tenant_id, tenantId), eq(schema.whatsappMessages.direction, "out"), sql`${schema.whatsappMessages.created_at} >= ${startIso}`, sql`${schema.whatsappMessages.created_at} <= ${endIso}`));
  const [newLeads] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.leads)
    .where(and(eq(schema.leads.tenant_id, tenantId), sql`${schema.leads.created_at} >= ${startIso}`, sql`${schema.leads.created_at} <= ${endIso}`));
  const [newContacts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.customers)
    .where(and(eq(schema.customers.tenant_id, tenantId), sql`${schema.customers.created_at} >= ${startIso}`, sql`${schema.customers.created_at} <= ${endIso}`));
  const [bookingsCreated] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), sql`${schema.bookings.created_at} >= ${startIso}`, sql`${schema.bookings.created_at} <= ${endIso}`));
  const [bookingsCompleted] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), eq(schema.bookings.status, "completed"), sql`${schema.bookings.updated_at} >= ${startIso}`, sql`${schema.bookings.updated_at} <= ${endIso}`));
  const revenueRows = await db
    .select({ amount: schema.payments.amount })
    .from(schema.payments)
    .where(and(eq(schema.payments.tenant_id, tenantId), eq(schema.payments.status, "success"), sql`${schema.payments.paid_at} >= ${startIso}`, sql`${schema.payments.paid_at} <= ${endIso}`));
  const revenueCollected = revenueRows.reduce((sum, r) => sum + r.amount, 0);

  const [existing] = await db
    .select({ id: schema.dailyStats.id })
    .from(schema.dailyStats)
    .where(and(eq(schema.dailyStats.tenant_id, tenantId), eq(schema.dailyStats.stat_date, dateKey)))
    .limit(1);

  const values = {
    messages_in: messagesIn?.count ?? 0,
    messages_out: messagesOut?.count ?? 0,
    new_contacts: newContacts?.count ?? 0,
    new_leads: newLeads?.count ?? 0,
    bookings_created: bookingsCreated?.count ?? 0,
    bookings_completed: bookingsCompleted?.count ?? 0,
    revenue_collected: Math.round(revenueCollected * 100) / 100,
  };

  if (existing) {
    await db.update(schema.dailyStats).set(values).where(eq(schema.dailyStats.id, existing.id));
  } else {
    await db.insert(schema.dailyStats).values({ id: crypto.randomUUID(), tenant_id: tenantId, stat_date: dateKey, ...values });
  }

  return { dateKey, ...values };
}
