import { and, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import { findAvailableStaff, localDayAndTime, WEEKDAYS } from "./staff-matching";

/**
 * Rule-based suggestion engine shared by the customer-facing booking site
 * (public.ts) and the owner dashboard (routes/suggestions.ts). Deliberately
 * heuristic/deterministic — no ML, no cross-tenant data — mirroring how
 * lib/followups.ts already does win-back/rebooking nudges off plain date
 * windows. Gemini-backed suggestions (the AI concierge) live in gemini.ts
 * instead, since those need language understanding, not ranking.
 */

// ---------------------------------------------------------------------------
// Customer-facing: rebook nudge
// ---------------------------------------------------------------------------

export interface RebookSuggestion {
  serviceId: string;
  serviceName: string;
  lastBookingDate: string;
  daysSinceLastBooking: number;
}

/** Looks up a returning customer by phone and suggests rebooking their last recurring-eligible service. */
export async function getRebookSuggestion(db: ReturnType<typeof createDb>, tenantId: string, phone: string): Promise<RebookSuggestion | null> {
  const [customer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.tenant_id, tenantId), eq(schema.customers.phone, phone))).limit(1);
  if (!customer) return null;

  const completed = await db
    .select({ serviceId: schema.bookings.service_id, updatedAt: schema.bookings.updated_at })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), eq(schema.bookings.customer_id, customer.id), eq(schema.bookings.status, "completed")))
    .orderBy(desc(schema.bookings.updated_at))
    .limit(5);
  if (completed.length === 0) return null;

  for (const booking of completed) {
    const [service] = await db.select({ id: schema.services.id, name: schema.services.name, recurrence_options: schema.services.recurrence_options, active: schema.services.active }).from(schema.services).where(eq(schema.services.id, booking.serviceId)).limit(1);
    if (!service?.active || !(service.recurrence_options as string[] | null)?.length) continue;
    const daysSince = Math.floor((Date.now() - new Date(booking.updatedAt).getTime()) / 86_400_000);
    return { serviceId: service.id, serviceName: service.name, lastBookingDate: booking.updatedAt, daysSinceLastBooking: daysSince };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Customer-facing: add-on / cross-sell suggestions
// ---------------------------------------------------------------------------

export interface AddOnSuggestion {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
}

/** "Customers who booked this also booked…" — plain co-occurrence over this tenant's own booking history, no ML. */
export async function getAddOnSuggestions(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  serviceId: string,
  opts: { exclude?: string[]; limit?: number } = {}
): Promise<AddOnSuggestion[]> {
  const limit = opts.limit ?? 3;
  const excluded = new Set([serviceId, ...(opts.exclude ?? [])]);

  const customerRows = await db
    .select({ customerId: schema.bookings.customer_id })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), eq(schema.bookings.service_id, serviceId), ne(schema.bookings.status, "cancelled")));
  const customerIds = [...new Set(customerRows.map((r) => r.customerId))];
  if (customerIds.length === 0) return [];

  const coBooked = await db
    .select({ serviceId: schema.bookings.service_id, count: sql<number>`count(*)`.as("count") })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), inArray(schema.bookings.customer_id, customerIds), ne(schema.bookings.status, "cancelled")))
    .groupBy(schema.bookings.service_id)
    .orderBy(desc(sql`count(*)`))
    .limit(limit + excluded.size);

  const candidateIds = coBooked.map((r) => r.serviceId).filter((id) => !excluded.has(id));
  if (candidateIds.length === 0) return [];

  const services = await db
    .select({ id: schema.services.id, name: schema.services.name, price: schema.services.price, duration_minutes: schema.services.duration_minutes, active: schema.services.active })
    .from(schema.services)
    .where(and(eq(schema.services.tenant_id, tenantId), inArray(schema.services.id, candidateIds)));

  const orderById = new Map(candidateIds.map((id, i) => [id, i]));
  return services
    .filter((s) => s.active)
    .sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0))
    .slice(0, limit)
    .map((s) => ({ id: s.id, name: s.name, price: s.price, durationMinutes: s.duration_minutes }));
}

// ---------------------------------------------------------------------------
// Customer-facing: smart time-slot suggestions
// ---------------------------------------------------------------------------

export interface SlotSuggestion {
  start: string; // ISO
  recommended: boolean;
}

const DAY_START_HHMM = "09:00";
const DAY_END_HHMM = "18:00";
const SLOT_STEP_MINUTES = 30;
// Mid-morning/early-afternoon read as "off-peak" for on-site service businesses
// (avoids the early-morning/end-of-day rush) — a static preference, not a
// learned one, since there's no per-tenant booking-density history to rank on yet.
const PREFERRED_HOURS = [10, 11, 14, 15];

/** Ranks bookable slots for a given local day so the booking widget can highlight a few good options instead of a flat calendar. */
export async function getBestSlots(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  params: { serviceId: string; dateIso: string; timezone: string } // dateIso: "YYYY-MM-DD"
): Promise<SlotSuggestion[]> {
  const [service] = await db.select({ duration_minutes: schema.services.duration_minutes }).from(schema.services).where(and(eq(schema.services.id, params.serviceId), eq(schema.services.tenant_id, tenantId))).limit(1);
  if (!service) return [];

  const [anyStaff] = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.tenant_id, tenantId), eq(schema.staff.active, true))).limit(1);

  const candidates: Array<{ start: Date; end: Date }> = [];
  const [startH, startM] = DAY_START_HHMM.split(":").map(Number);
  const [endH, endM] = DAY_END_HHMM.split(":").map(Number);
  for (let mins = startH! * 60 + startM!; mins + service.duration_minutes <= endH! * 60 + endM!; mins += SLOT_STEP_MINUTES) {
    const start = new Date(`${params.dateIso}T00:00:00`);
    start.setMinutes(start.getMinutes() + mins);
    const end = new Date(start.getTime() + service.duration_minutes * 60_000);
    candidates.push({ start, end });
  }

  const results: SlotSuggestion[] = [];
  if (anyStaff) {
    for (const slot of candidates) {
      const staff = await findAvailableStaff(db, tenantId, { start: slot.start.toISOString(), end: slot.end.toISOString(), timezone: params.timezone });
      if (staff.length === 0) continue;
      results.push({ start: slot.start.toISOString(), recommended: false });
    }
  } else {
    const dayStart = candidates[0]?.start.toISOString();
    const dayEnd = candidates[candidates.length - 1]?.end.toISOString();
    if (!dayStart || !dayEnd) return [];
    const existing = await db
      .select({ start: schema.bookings.scheduled_start, end: schema.bookings.scheduled_end })
      .from(schema.bookings)
      .where(and(eq(schema.bookings.tenant_id, tenantId), ne(schema.bookings.status, "cancelled"), lte(schema.bookings.scheduled_start, dayEnd), gte(schema.bookings.scheduled_end, dayStart)));
    for (const slot of candidates) {
      const conflict = existing.some((b) => new Date(b.start) < slot.end && new Date(b.end) > slot.start);
      if (conflict) continue;
      results.push({ start: slot.start.toISOString(), recommended: false });
    }
  }

  // Mark a handful of off-peak, bookable slots as recommended.
  let marked = 0;
  for (const r of results) {
    const hour = new Date(r.start).getHours();
    if (PREFERRED_HOURS.includes(hour) && marked < 3) {
      r.recommended = true;
      marked++;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Owner-facing: follow-up queue
// ---------------------------------------------------------------------------

export interface FollowUpItem {
  type: "hot_lead" | "stalling_quote" | "rebook_due";
  id: string;
  title: string;
  subtitle: string;
  phone: string;
}

/** Ranked "who to follow up with today" for the Today page — surfaces the same signals lib/followups.ts already nudges over WhatsApp, before the automated nudge fires. */
export async function getFollowUpQueue(db: ReturnType<typeof createDb>, tenantId: string): Promise<FollowUpItem[]> {
  const items: FollowUpItem[] = [];

  const hotLeads = await db
    .select({ id: schema.leads.id, name: schema.leads.customer_name, phone: schema.leads.phone, interest: schema.leads.service_interest, createdAt: schema.leads.created_at })
    .from(schema.leads)
    .where(and(eq(schema.leads.tenant_id, tenantId), eq(schema.leads.mood, "hot"), eq(schema.leads.status, "open")));
  for (const lead of hotLeads) {
    items.push({ type: "hot_lead", id: lead.id, title: lead.name ?? lead.phone, subtitle: `Hot lead, not yet quoted${lead.interest ? ` — wants ${lead.interest}` : ""}`, phone: lead.phone });
  }

  const staleCutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const stallingQuotes = await db
    .select({ id: schema.leads.id, name: schema.leads.customer_name, phone: schema.leads.phone, updatedAt: schema.leads.updated_at })
    .from(schema.leads)
    .where(and(eq(schema.leads.tenant_id, tenantId), eq(schema.leads.status, "quoted"), lte(schema.leads.updated_at, staleCutoff)));
  for (const lead of stallingQuotes) {
    const hours = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 3_600_000);
    items.push({ type: "stalling_quote", id: lead.id, title: lead.name ?? lead.phone, subtitle: `Quoted ${hours}h ago, still hasn't booked`, phone: lead.phone });
  }

  const rebookWindowStart = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const rebookWindowEnd = new Date(Date.now() - 25 * 86_400_000).toISOString();
  const dueBookings = await db
    .select({ customerId: schema.bookings.customer_id, serviceId: schema.bookings.service_id, updatedAt: schema.bookings.updated_at })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), eq(schema.bookings.status, "completed"), gte(schema.bookings.updated_at, rebookWindowStart), lte(schema.bookings.updated_at, rebookWindowEnd)))
    .orderBy(desc(schema.bookings.updated_at));
  const seenCustomers = new Set<string>();
  for (const booking of dueBookings) {
    if (seenCustomers.has(booking.customerId)) continue;
    const [service] = await db.select({ name: schema.services.name, recurrence_options: schema.services.recurrence_options }).from(schema.services).where(eq(schema.services.id, booking.serviceId)).limit(1);
    if (!service || !(service.recurrence_options as string[] | null)?.length) continue;
    seenCustomers.add(booking.customerId);
    const [customer] = await db.select({ name: schema.customers.name, phone: schema.customers.phone }).from(schema.customers).where(eq(schema.customers.id, booking.customerId)).limit(1);
    if (!customer) continue;
    const days = Math.floor((Date.now() - new Date(booking.updatedAt).getTime()) / 86_400_000);
    items.push({ type: "rebook_due", id: booking.customerId, title: customer.name, subtitle: `${days} days since last ${service.name} — due for a rebook nudge`, phone: customer.phone });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Owner-facing: staffing gaps
// ---------------------------------------------------------------------------

export interface StaffingGap {
  date: string; // YYYY-MM-DD, tenant-local
  hour: number; // 0-23, tenant-local
  bookedCount: number;
  availableStaffCount: number;
}

/** Flags upcoming hours where more jobs are booked than staff who nominally cover that hour — coverage counting, not route/schedule optimization. */
export async function getStaffingGaps(db: ReturnType<typeof createDb>, tenantId: string, timezone: string, days = 7): Promise<StaffingGap[]> {
  const activeStaff = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.tenant_id, tenantId), eq(schema.staff.active, true)));
  if (activeStaff.length === 0) return [];

  const availability = await db.select().from(schema.staffAvailability).where(eq(schema.staffAvailability.tenant_id, tenantId));

  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + days * 86_400_000).toISOString();
  const bookings = await db
    .select({ staffId: schema.bookings.staff_id, start: schema.bookings.scheduled_start })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.tenant_id, tenantId), eq(schema.bookings.status, "scheduled"), gte(schema.bookings.scheduled_start, now), lte(schema.bookings.scheduled_start, horizon)));
  if (bookings.length === 0) return [];

  const bucketKey = (dateStr: string, hour: number) => `${dateStr}|${hour}`;
  const bookedByBucket = new Map<string, number>();
  for (const b of bookings) {
    const { hhmm } = localDayAndTime(b.start, timezone);
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(b.start));
    const hour = Number(hhmm.split(":")[0]);
    const key = bucketKey(dateStr, hour);
    bookedByBucket.set(key, (bookedByBucket.get(key) ?? 0) + 1);
  }

  const gaps: StaffingGap[] = [];
  for (const [key, bookedCount] of bookedByBucket) {
    const [dateStr, hourStr] = key.split("|");
    const hour = Number(hourStr);
    const dayOfWeek = WEEKDAYS.indexOf(new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date(`${dateStr}T12:00:00`)));
    const hhmm = `${String(hour).padStart(2, "0")}:00`;
    const availableStaffCount = new Set(
      availability.filter((a) => a.day_of_week === dayOfWeek && a.start_time <= hhmm && hhmm < a.end_time).map((a) => a.staff_id)
    ).size || activeStaff.length; // no availability rows configured = assume all staff available, matching staff-matching.ts's convention

    if (bookedCount > availableStaffCount) {
      gaps.push({ date: dateStr!, hour, bookedCount, availableStaffCount });
    }
  }

  return gaps.sort((a, b) => (a.date === b.date ? a.hour - b.hour : a.date.localeCompare(b.date)));
}
