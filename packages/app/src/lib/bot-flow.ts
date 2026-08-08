import { and, eq } from "drizzle-orm";
import { createDb, schema, type Env } from "@serviceos/platform";
import { reserveSlot } from "./booking-lock";
import { geminiExtractBookingIntent } from "./gemini";

/**
 * Enquiry bot (spec §5): greets, asks service type/area/date, captures the
 * lead with mood/status tagging, gives a standard-service auto-quote, and
 * on confirmation writes straight into `bookings` — the same table the app
 * UI reads, so there's no separate "WA bookings" to reconcile. Escalates to
 * a human whenever the message doesn't fit a listed service (custom/large
 * jobs, per spec). Conversation state itself stays deterministic (tracked
 * via the lead row's own columns); only the *interpretation* of each
 * message — matching a service, extracting an area or date/time, judging
 * urgency — is delegated to Gemini (see lib/gemini.ts), since free-form
 * WhatsApp text is exactly what regex/keyword matching handles poorly.
 */

async function loadActiveServices(db: ReturnType<typeof createDb>, tenantId: string) {
  return db
    .select({ id: schema.services.id, name: schema.services.name, category: schema.services.category, price: schema.services.price, duration_minutes: schema.services.duration_minutes })
    .from(schema.services)
    .where(and(eq(schema.services.tenant_id, tenantId), eq(schema.services.active, true)));
}

export async function processInboundText(
  env: Env,
  tenantId: string,
  phone: string,
  customerName: string | undefined,
  text: string
): Promise<string> {
  const db = createDb(env.DB);
  const services = await loadActiveServices(db, tenantId);
  const [tenant] = await db
    .select({ business_name: schema.tenants.business_name, bot_persona_name: schema.tenants.bot_persona_name, timezone: schema.tenants.timezone })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  const timezone = tenant?.timezone ?? "Asia/Dubai";
  const nowIso = new Date().toISOString();

  const extract = (focusHint: string, contextNote?: string) =>
    geminiExtractBookingIntent(env.GEMINI_API_KEY, env.GEMINI_MODEL, { latestMessage: text, contextNote, services, nowIso, timezone, focusHint });

  const matchedService = (index: number | null | undefined) => (index != null && index >= 0 && index < services.length ? services[index] : undefined);

  let [lead] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.tenant_id, tenantId), eq(schema.leads.phone, phone), eq(schema.leads.status, "open")))
    .limit(1);

  if (!lead) {
    const extraction = await extract("This is the customer's first message — infer their mood/urgency only.");
    const leadId = crypto.randomUUID();
    await db.insert(schema.leads).values({
      id: leadId,
      tenant_id: tenantId,
      customer_name: customerName,
      phone,
      mood: extraction?.mood ?? "neutral",
      status: "open",
      source: "whatsapp",
    });
    const botName = tenant?.bot_persona_name ?? tenant?.business_name ?? "our team";
    return `Hi! This is ${botName}. What service are you looking for, and which area are you in?`;
  }

  // Step 1: capture service interest
  if (!lead.service_interest) {
    const extraction = await extract("The customer is describing what service they need.");
    await db
      .update(schema.leads)
      .set({ service_interest: text, mood: extraction?.mood ?? lead.mood, updated_at: new Date().toISOString() })
      .where(eq(schema.leads.id, lead.id));
    return "Great, and which area/neighbourhood are you in?";
  }

  // Step 2: capture area, then attempt an auto-quote for a standard service match
  if (!lead.area) {
    const extraction = await extract(
      "Match the earlier service description to one of the listed services, and extract the area/neighbourhood from the latest message.",
      `Earlier, the customer described their service need as: "${lead.service_interest}"`
    );

    const area = extraction?.area ?? text;
    await db.update(schema.leads).set({ area, status: "quoted", updated_at: new Date().toISOString() }).where(eq(schema.leads.id, lead.id));

    const match = matchedService(extraction?.serviceMatchIndex);
    if (match && !extraction?.isCustomRequest) {
      return `Got it. ${match.name} typically starts at AED ${match.price.toFixed(0)} (approx. ${match.duration_minutes} mins). To book, just tell me your preferred date & time (e.g. "tomorrow at 2pm" or "15 Aug, 2pm"). For anything custom, our team will follow up shortly.`;
    }
    return "Thanks — that's a bit more custom, so one of our team will follow up shortly with a quote.";
  }

  // Step 3: awaiting a date/time to confirm the booking
  if (lead.status === "quoted") {
    const extraction = await extract(
      "The customer is expected to give a preferred date & time to confirm booking, or a simple confirmation of an already-suggested time.",
      `Earlier, the customer described their service need as: "${lead.service_interest}"`
    );

    const when = extraction?.preferredDateTimeIso ? new Date(extraction.preferredDateTimeIso) : null;
    if (!when || Number.isNaN(when.getTime())) {
      return "Sorry, I didn't catch a date/time. Could you tell me your preferred day and time?";
    }

    const match = matchedService(extraction?.serviceMatchIndex);
    if (!match) {
      return "Let me get a teammate to confirm the exact service and pricing with you shortly.";
    }

    const [existingCustomer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.tenant_id, tenantId), eq(schema.customers.phone, phone))).limit(1);
    let customerId = existingCustomer?.id;
    if (!customerId) {
      customerId = crypto.randomUUID();
      await db.insert(schema.customers).values({ id: customerId, tenant_id: tenantId, name: customerName ?? lead.customer_name ?? phone, phone });
    }

    const start = when.toISOString();
    const end = new Date(when.getTime() + match.duration_minutes * 60_000).toISOString();
    const bookingId = crypto.randomUUID();

    const reserve = await reserveSlot(env, tenantId, undefined, bookingId, start, end);
    if (!reserve.ok) {
      return "That slot just got taken — please suggest another date/time.";
    }

    await db.insert(schema.bookings).values({
      id: bookingId,
      tenant_id: tenantId,
      customer_id: customerId,
      service_id: match.id,
      status: "scheduled",
      scheduled_start: start,
      scheduled_end: end,
      source: "whatsapp",
    });

    await db.update(schema.leads).set({ status: "booked", converted_booking_id: bookingId, updated_at: new Date().toISOString() }).where(eq(schema.leads.id, lead.id));

    return `You're booked! ${match.name} on ${when.toUTCString()}. We'll send a reminder before your appointment.`;
  }

  return "Thanks for the message — a team member will follow up with you shortly.";
}
