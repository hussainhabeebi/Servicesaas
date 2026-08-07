import { and, eq, like } from "drizzle-orm";
import { createDb, schema, type Env } from "@serviceos/platform";
import { reserveSlot } from "./booking-lock";

/**
 * Rule-based enquiry bot (spec §5): greets, asks service type/area/date,
 * captures the lead with mood/status tagging, gives a standard-service
 * auto-quote, and on confirmation writes straight into `bookings` — the
 * same table the app UI reads, so there's no separate "WA bookings" to
 * reconcile. Escalates to a human whenever the message doesn't fit the
 * expected step (custom/large jobs, per spec).
 */

const DATE_TIME_RE = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})/;

function parseDateTime(text: string): Date | null {
  const m = text.match(DATE_TIME_RE);
  if (!m) return null;
  const [, day, month, year, hour, minute] = m;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function inferMood(text: string): "hot" | "warm" | "neutral" | "cold" {
  const lower = text.toLowerCase();
  if (/(asap|urgent|today|now|emergency)/.test(lower)) return "hot";
  if (/(tomorrow|this week|soon)/.test(lower)) return "warm";
  return "neutral";
}

export async function processInboundText(
  env: Env,
  tenantId: string,
  phone: string,
  customerName: string | undefined,
  text: string
): Promise<string> {
  const db = createDb(env.DB);

  let [lead] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.tenant_id, tenantId), eq(schema.leads.phone, phone), eq(schema.leads.status, "open")))
    .limit(1);

  if (!lead) {
    const leadId = crypto.randomUUID();
    await db.insert(schema.leads).values({
      id: leadId,
      tenant_id: tenantId,
      customer_name: customerName,
      phone,
      mood: inferMood(text),
      status: "open",
      source: "whatsapp",
    });
    const [tenant] = await db.select({ business_name: schema.tenants.business_name, bot_persona_name: schema.tenants.bot_persona_name }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
    const botName = tenant?.bot_persona_name ?? tenant?.business_name ?? "our team";
    return `Hi! This is ${botName}. What service are you looking for, and which area are you in?`;
  }

  // Step 1: capture service interest
  if (!lead.service_interest) {
    await db.update(schema.leads).set({ service_interest: text, mood: inferMood(text), updated_at: new Date().toISOString() }).where(eq(schema.leads.id, lead.id));
    return "Great, and which area/neighbourhood are you in?";
  }

  // Step 2: capture area, then attempt an auto-quote for a standard service match
  if (!lead.area) {
    const [match] = await db
      .select()
      .from(schema.services)
      .where(and(eq(schema.services.tenant_id, tenantId), like(schema.services.name, `%${lead.service_interest.split(" ")[0]}%`)))
      .limit(1);

    await db.update(schema.leads).set({ area: text, status: "quoted", updated_at: new Date().toISOString() }).where(eq(schema.leads.id, lead.id));

    if (match) {
      return `Got it. ${match.name} typically starts at AED ${match.price.toFixed(0)} (approx. ${match.duration_minutes} mins). To book, reply with your preferred date & time as DD-MM-YYYY HH:MM (e.g. 15-08-2026 14:00). For anything custom, our team will follow up shortly.`;
    }
    return "Thanks — that's a bit more custom, so one of our team will follow up shortly with a quote.";
  }

  // Step 3: awaiting a date/time to confirm the booking
  if (lead.status === "quoted") {
    const when = parseDateTime(text);
    if (!when) {
      return "Sorry, I didn't catch a date/time. Please reply as DD-MM-YYYY HH:MM, e.g. 15-08-2026 14:00.";
    }

    const [service] = await db
      .select()
      .from(schema.services)
      .where(and(eq(schema.services.tenant_id, tenantId), like(schema.services.name, `%${lead.service_interest?.split(" ")[0] ?? ""}%`)))
      .limit(1);
    if (!service) {
      return "Let me get a teammate to confirm the exact service and pricing with you shortly.";
    }

    const [existingCustomer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.tenant_id, tenantId), eq(schema.customers.phone, phone))).limit(1);
    let customerId = existingCustomer?.id;
    if (!customerId) {
      customerId = crypto.randomUUID();
      await db.insert(schema.customers).values({ id: customerId, tenant_id: tenantId, name: customerName ?? lead.customer_name ?? phone, phone });
    }

    const start = when.toISOString();
    const end = new Date(when.getTime() + service.duration_minutes * 60_000).toISOString();
    const bookingId = crypto.randomUUID();

    const reserve = await reserveSlot(env, tenantId, undefined, bookingId, start, end);
    if (!reserve.ok) {
      return "That slot just got taken — please suggest another date/time.";
    }

    await db.insert(schema.bookings).values({
      id: bookingId,
      tenant_id: tenantId,
      customer_id: customerId,
      service_id: service.id,
      status: "scheduled",
      scheduled_start: start,
      scheduled_end: end,
      source: "whatsapp",
    });

    await db.update(schema.leads).set({ status: "booked", converted_booking_id: bookingId, updated_at: new Date().toISOString() }).where(eq(schema.leads.id, lead.id));

    return `You're booked! ${service.name} on ${when.toUTCString()}. We'll send a reminder before your appointment.`;
  }

  return "Thanks for the message — a team member will follow up with you shortly.";
}
