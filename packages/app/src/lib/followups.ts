import { and, eq, gte, lte } from "drizzle-orm";
import { createDb, schema, sendChatwootProactiveMessage, type Env, type ChatwootConfig } from "@serviceos/platform";

/**
 * Automated follow-ups & win-back, and rebooking nudges (spec §2/§10).
 * Runs once daily off the existing cron alongside the stats rollup — each
 * check uses a narrow "N hours/days ago" window rather than a "nudged"
 * flag, so a lead/booking gets exactly one nudge per day-of-inactivity
 * window instead of a full state-machine. Simple on purpose.
 */
export async function runFollowUpsForTenant(env: Env, tenantId: string): Promise<{ winBackSent: number; rebookingSent: number }> {
  const db = createDb(env.DB);
  const [tenant] = await db
    .select({ chatwoot_account_id: schema.tenants.chatwoot_account_id, chatwoot_inbox_id: schema.tenants.chatwoot_inbox_id })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  if (!tenant?.chatwoot_account_id || !tenant.chatwoot_inbox_id) return { winBackSent: 0, rebookingSent: 0 };

  const chatwootConfig: ChatwootConfig = { baseUrl: env.CHATWOOT_BASE_URL, apiAccessToken: env.CHATWOOT_AGENT_BOT_TOKEN, accountId: tenant.chatwoot_account_id };

  // Win-back: leads quoted but gone quiet for ~48 hours
  const now = Date.now();
  const windowStart = new Date(now - 50 * 3_600_000).toISOString();
  const windowEnd = new Date(now - 46 * 3_600_000).toISOString();
  const staleLeads = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.tenant_id, tenantId), eq(schema.leads.status, "quoted"), gte(schema.leads.updated_at, windowStart), lte(schema.leads.updated_at, windowEnd)));

  let winBackSent = 0;
  for (const lead of staleLeads) {
    const result = await sendChatwootProactiveMessage(
      chatwootConfig,
      tenant.chatwoot_inbox_id,
      lead.phone,
      lead.customer_name ?? lead.phone,
      `Hi! Just checking in — still interested in ${lead.service_interest ?? "getting this sorted"}? Reply with your preferred date & time and we'll get you booked in.`
    ).catch(() => ({ ok: false }));
    if (result.ok) winBackSent++;
  }

  // Rebooking nudges: completed jobs ~30 days ago for services that support recurrence
  const rebookWindowStart = new Date(now - 31 * 86_400_000).toISOString();
  const rebookWindowEnd = new Date(now - 30 * 86_400_000).toISOString();
  const dueForRebooking = await db
    .select({ bookingId: schema.bookings.id, customerId: schema.bookings.customer_id, serviceId: schema.bookings.service_id })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), eq(schema.bookings.status, "completed"), gte(schema.bookings.updated_at, rebookWindowStart), lte(schema.bookings.updated_at, rebookWindowEnd)));

  let rebookingSent = 0;
  for (const booking of dueForRebooking) {
    const [service] = await db.select({ name: schema.services.name, recurrence_options: schema.services.recurrence_options }).from(schema.services).where(eq(schema.services.id, booking.serviceId)).limit(1);
    if (!service || !(service.recurrence_options as string[] | null)?.length) continue;
    const [customer] = await db.select({ name: schema.customers.name, phone: schema.customers.phone }).from(schema.customers).where(eq(schema.customers.id, booking.customerId)).limit(1);
    if (!customer) continue;

    const result = await sendChatwootProactiveMessage(
      chatwootConfig,
      tenant.chatwoot_inbox_id,
      customer.phone,
      customer.name,
      `Hi ${customer.name}! It's been about a month since your last ${service.name} — want us to book you in again?`
    ).catch(() => ({ ok: false }));
    if (result.ok) rebookingSent++;
  }

  return { winBackSent, rebookingSent };
}
