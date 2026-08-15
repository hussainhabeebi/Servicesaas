import { and, eq, gte, lte } from "drizzle-orm";
import { createDb, schema, type Env } from "@serviceos/platform";
import { sendWebPush } from "./webpush";

/**
 * Booking reminders via Web Push — runs off the same daily cron as the
 * stats rollup and WhatsApp follow-ups (see index.ts's scheduled handler),
 * targeting bookings roughly a day out. A narrow "N hours from now" window
 * (same pattern as lib/followups.ts) so a booking gets exactly one push per
 * day-of-lead-time window instead of needing a "already reminded" flag.
 * Silently a no-op for any tenant without VAPID keys configured — push is a
 * secondary channel alongside the WhatsApp job-reminder task, not a
 * replacement for it.
 */
export async function runPushRemindersForTenant(env: Env, tenantId: string): Promise<{ sent: number }> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0 };
  const db = createDb(env.DB);

  const windowStart = new Date(Date.now() + 22 * 3_600_000).toISOString();
  const windowEnd = new Date(Date.now() + 26 * 3_600_000).toISOString();
  const upcoming = await db
    .select({ id: schema.bookings.id, customerId: schema.bookings.customer_id, serviceId: schema.bookings.service_id, start: schema.bookings.scheduled_start })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), eq(schema.bookings.status, "scheduled"), gte(schema.bookings.scheduled_start, windowStart), lte(schema.bookings.scheduled_start, windowEnd)));
  if (upcoming.length === 0) return { sent: 0 };

  let sent = 0;
  for (const booking of upcoming) {
    const subs = await db.select().from(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.tenant_id, tenantId), eq(schema.pushSubscriptions.customer_id, booking.customerId)));
    if (subs.length === 0) continue;

    const [service] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, booking.serviceId)).limit(1);
    const time = new Date(booking.start).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit" });

    for (const sub of subs) {
      const result = await sendWebPush(env, sub, {
        title: "Booking reminder",
        body: `Your ${service?.name ?? "booking"} is tomorrow at ${time}.`,
      }).catch(() => ({ ok: false, expired: false }));
      if (result.expired) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, sub.id));
      else if (result.ok) sent++;
    }
  }

  return { sent };
}
