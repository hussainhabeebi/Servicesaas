import { Hono, type Context } from "hono";
import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { bookingCalendarId } from "../durable-objects/booking-calendar";
import { reserveSlot } from "../lib/booking-lock";
import { createJobReminderTask, createStaffAssignmentTask } from "../lib/tasks";
import { findAvailableStaff } from "../lib/staff-matching";
import { createAndSendDepositInvoice } from "../lib/deposits";
import { recordCompletionIfNew } from "../lib/loyalty";
import { ensureInvoiceForCompletedBooking } from "../lib/billing-on-completion";

export const bookingsRoute = new Hono<AppContext>();

const CANCELLATION_CUTOFF_HOURS = 24;
const CANCELLATION_FEE_RATE = 0.25;

const createSchema = z.object({
  customer_id: z.string(),
  staff_id: z.string().optional(), // omitted = auto-assign by area/availability, or solo-operator mode if no staff exist
  service_id: z.string(),
  address_id: z.string().optional(),
  area: z.string().optional(), // defaults to the address's area if address_id is given
  scheduled_start: z.string(), // ISO
  scheduled_end: z.string(), // ISO
  recurrence_rule: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  recurrence_count: z.number().int().min(1).max(52).default(1),
  source: z.enum(["app", "whatsapp", "website"]).default("app"),
  notes: z.string().optional(),
});

/** Resolves the booking's area and, when staff_id isn't given explicitly, the best-matching active staff member for the first occurrence's slot. */
async function resolveAreaAndStaff(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  input: z.infer<typeof createSchema>
): Promise<{ area: string | undefined; staffId: string | undefined; autoAssignFailed: boolean }> {
  let area = input.area;
  if (!area && input.address_id) {
    const [address] = await db
      .select({ area: schema.customerAddresses.area })
      .from(schema.customerAddresses)
      .where(and(eq(schema.customerAddresses.id, input.address_id), eq(schema.customerAddresses.tenant_id, tenantId)))
      .limit(1);
    area = address?.area ?? undefined;
  }

  if (input.staff_id) return { area, staffId: input.staff_id, autoAssignFailed: false };

  const [anyStaff] = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.tenant_id, tenantId), eq(schema.staff.active, true))).limit(1);
  if (!anyStaff) return { area, staffId: undefined, autoAssignFailed: false }; // solo-operator tenant, nothing to match against

  const [tenant] = await db.select({ timezone: schema.tenants.timezone }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const candidates = await findAvailableStaff(db, tenantId, {
    area,
    start: input.scheduled_start,
    end: input.scheduled_end,
    timezone: tenant?.timezone ?? "Asia/Dubai",
  });
  return { area, staffId: candidates[0]?.id, autoAssignFailed: candidates.length === 0 };
}

/** A staff-role login may only act on jobs assigned to their own staff_id — owner/admin are unrestricted. */
async function staffCanActOnBooking(c: Context<AppContext>, db: ReturnType<typeof createDb>, tenantId: string, bookingId: string): Promise<boolean> {
  if (c.get("tenantRole") !== "staff") return true;
  const [booking] = await db.select({ staff_id: schema.bookings.staff_id }).from(schema.bookings).where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId))).limit(1);
  return !!booking && booking.staff_id === c.get("staffId");
}

async function staffTransitionAllowed(c: Context<AppContext>, db: ReturnType<typeof createDb>, bookingId: string, target: string) {
  if (c.get("tenantRole") !== "staff") return true;
  const [booking] = await db.select({ status: schema.bookings.status }).from(schema.bookings).where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, c.get("tenantId")), eq(schema.bookings.staff_id, c.get("staffId")!))).limit(1);
  return !!booking && ((target === "en_route" && booking.status === "scheduled") || (target === "in_progress" && ["scheduled", "en_route"].includes(booking.status)) || (target === "completed" && booking.status === "in_progress"));
}

function addRecurrence(dateIso: string, rule: "weekly" | "biweekly" | "monthly"): string {
  const date = new Date(dateIso);
  if (rule === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else if (rule === "biweekly") date.setUTCDate(date.getUTCDate() + 14);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

bookingsRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const { staff_id, from, to, status } = c.req.query();
  const conditions = [eq(schema.bookings.tenant_id, c.get("tenantId"))];
  if (c.get("customerId")) conditions.push(eq(schema.bookings.customer_id, c.get("customerId")!));
  if (staff_id) conditions.push(eq(schema.bookings.staff_id, staff_id));
  if (status) conditions.push(eq(schema.bookings.status, status));
  if (from) conditions.push(gte(schema.bookings.scheduled_start, from));
  if (to) conditions.push(lte(schema.bookings.scheduled_start, to));
  const rows = await db
    .select()
    .from(schema.bookings)
    .where(and(...conditions));
  return c.json({ bookings: rows });
});

/**
 * A staff member's own job list — the mobile "My Jobs" flow (apps/tenant).
 * Scoped to their own staff_id (from the JWT, see auth/jwt.ts) rather than
 * trusting a query param, so a staff login can never browse another crew
 * member's schedule.
 */
bookingsRoute.get("/mine", async (c) => {
  const staffId = c.get("staffId");
  if (!staffId) return c.json({ error: "This login isn't linked to a staff record" }, 403);
  const db = createDb(c.env.DB);
  const { from, to, status } = c.req.query();
  const conditions = [eq(schema.bookings.tenant_id, c.get("tenantId")), eq(schema.bookings.staff_id, staffId)];
  if (status) conditions.push(eq(schema.bookings.status, status));
  if (from) conditions.push(gte(schema.bookings.scheduled_start, from));
  if (to) conditions.push(lte(schema.bookings.scheduled_start, to));
  const rows = await db
    .select()
    .from(schema.bookings)
    .where(and(...conditions));
  return c.json({ bookings: rows });
});

/** Who's free for a given area/slot — used by the app UI to offer a staff picker before or instead of relying on auto-assignment. */
bookingsRoute.get("/available-staff", async (c) => {
  const { area, start, end } = c.req.query();
  if (!start || !end) return c.json({ error: "start and end are required" }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const [tenant] = await db.select({ timezone: schema.tenants.timezone }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const staff = await findAvailableStaff(db, tenantId, { area, start, end, timezone: tenant?.timezone ?? "Asia/Dubai" });
  return c.json({ staff });
});

bookingsRoute.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  if (c.get("customerId")) {
    input.customer_id = c.get("customerId")!;
    input.staff_id = undefined;
    input.source = "website";
  }
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const [service] = await db
    .select()
    .from(schema.services)
    .where(and(eq(schema.services.id, input.service_id), eq(schema.services.tenant_id, tenantId), eq(schema.services.active, true)))
    .limit(1);
  if (!service) return c.json({ error: "Service not found" }, 404);
  const [customer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.id, input.customer_id), eq(schema.customers.tenant_id, tenantId))).limit(1);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  if (input.address_id) {
    const [address] = await db.select({ id: schema.customerAddresses.id }).from(schema.customerAddresses).where(and(eq(schema.customerAddresses.id, input.address_id), eq(schema.customerAddresses.tenant_id, tenantId), eq(schema.customerAddresses.customer_id, input.customer_id))).limit(1);
    if (!address) return c.json({ error: "Address not found" }, 404);
  }
  if (c.get("customerId")) {
    if (!input.address_id) return c.json({ error: "Please save and select an address" }, 400);
    if (input.recurrence_rule && !(service.recurrence_options ?? []).includes(input.recurrence_rule)) return c.json({ error: "Recurring booking is not offered for this service" }, 400);
    const timestamp = Date.parse(input.scheduled_start);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return c.json({ error: "Choose a future date" }, 400);
    input.scheduled_start = new Date(timestamp).toISOString();
    input.scheduled_end = new Date(timestamp + service.duration_minutes * 60000).toISOString();
  }
  if (!Number.isFinite(Date.parse(input.scheduled_start)) || !Number.isFinite(Date.parse(input.scheduled_end)) || Date.parse(input.scheduled_end) <= Date.parse(input.scheduled_start)) return c.json({ error: "Invalid booking dates" }, 400);
  const { area, staffId, autoAssignFailed } = await resolveAreaAndStaff(db, tenantId, input);

  const created: Array<{ id: string; scheduled_start: string; scheduled_end: string }> = [];
  let start = input.scheduled_start;
  let end = input.scheduled_end;
  let parentId: string | undefined;
  const durationMs = new Date(input.scheduled_end).getTime() - new Date(input.scheduled_start).getTime();

  for (let i = 0; i < input.recurrence_count; i++) {
    const bookingId = crypto.randomUUID();
    const reserve = await reserveSlot(c.env, tenantId, staffId, bookingId, start, end);
    if (!reserve.ok) {
      return c.json(
        { error: "Slot conflicts with an existing booking", failedAtOccurrence: i, bookings: created },
        409
      );
    }

    await db.insert(schema.bookings).values({
      id: bookingId,
      tenant_id: tenantId,
      customer_id: input.customer_id,
      staff_id: staffId,
      service_id: input.service_id,
      address_id: input.address_id,
      area,
      status: "scheduled",
      scheduled_start: start,
      scheduled_end: end,
      recurrence_rule: input.recurrence_rule,
      parent_booking_id: parentId,
      source: input.source,
      notes: input.notes,
    });

    await createJobReminderTask(db, tenantId, bookingId, staffId, start);
    if (i === 0 && autoAssignFailed) await createStaffAssignmentTask(db, tenantId, bookingId, area, start);
    // Deposit only applies to the first occurrence of a recurring series, not every instance.
    if (i === 0 && service) await createAndSendDepositInvoice(c.env, tenantId, { bookingId, customerId: input.customer_id, service }).catch(() => {});

    created.push({ id: bookingId, scheduled_start: start, scheduled_end: end });
    if (i === 0) parentId = bookingId;
    if (!input.recurrence_rule || i === input.recurrence_count - 1) break;
    start = addRecurrence(start, input.recurrence_rule);
    end = new Date(new Date(start).getTime() + durationMs).toISOString();
  }

  return c.json({ bookings: created }, 201);
});

bookingsRoute.patch("/:id/reschedule", async (c) => {
  const schemaBody = z.object({ scheduled_start: z.string(), scheduled_end: z.string() });
  const parsed = schemaBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const bookingId = c.req.param("id");

  const [booking] = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)))
    .limit(1);
  if (!booking) return c.json({ error: "Not found" }, 404);

  if (!["scheduled", "en_route"].includes(booking.status)) return c.json({ error: "This booking can no longer be changed" }, 409);
  const start = Date.parse(parsed.data.scheduled_start);
  const end = Date.parse(parsed.data.scheduled_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || (c.get("customerId") && (start <= Date.now() || end - start !== Date.parse(booking.scheduled_end) - Date.parse(booking.scheduled_start)))) return c.json({ error: "Invalid booking dates or duration" }, 400);
  parsed.data.scheduled_start = new Date(start).toISOString();
  parsed.data.scheduled_end = new Date(end).toISOString();

  if (booking.staff_id) {
    const doId = bookingCalendarId(c.env.BOOKING_CALENDAR, tenantId, booking.staff_id);
    const stub = c.env.BOOKING_CALENDAR.get(doId);
    const res = await stub.fetch("https://do/reschedule", {
      method: "POST",
      body: JSON.stringify({ bookingId, start: parsed.data.scheduled_start, end: parsed.data.scheduled_end }),
    });
    const result = (await res.json()) as { ok: boolean; conflictBookingId?: string };
    if (!result.ok) return c.json({ error: "New slot conflicts with an existing booking", conflictBookingId: result.conflictBookingId }, 409);
  }

  await db
    .update(schema.bookings)
    .set({ ...parsed.data, updated_at: new Date().toISOString() })
    .where(eq(schema.bookings.id, bookingId));
  return c.json({ ok: true });
});

bookingsRoute.post("/:id/cancel", async (c) => {
  const body = z.object({ reason: z.string().optional() }).safeParse(await c.req.json().catch(() => ({}))).data ?? {};
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const bookingId = c.req.param("id");

  const [booking] = await db
    .select({ id: schema.bookings.id, status: schema.bookings.status, staff_id: schema.bookings.staff_id, scheduled_start: schema.bookings.scheduled_start, service_id: schema.bookings.service_id })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)))
    .limit(1);
  if (!booking) return c.json({ error: "Not found" }, 404);
  if (!["scheduled", "en_route"].includes(booking.status)) return c.json({ error: "This booking can no longer be cancelled" }, 409);

  const hoursUntil = (new Date(booking.scheduled_start).getTime() - Date.now()) / 3_600_000;
  let cancellationFee = 0;
  if (hoursUntil < CANCELLATION_CUTOFF_HOURS) {
    const [service] = await db.select({ price: schema.services.price }).from(schema.services).where(eq(schema.services.id, booking.service_id)).limit(1);
    cancellationFee = Math.round((service?.price ?? 0) * CANCELLATION_FEE_RATE * 100) / 100;
  }

  if (booking.staff_id) {
    const doId = bookingCalendarId(c.env.BOOKING_CALENDAR, tenantId, booking.staff_id);
    const stub = c.env.BOOKING_CALENDAR.get(doId);
    await stub.fetch("https://do/release", { method: "POST", body: JSON.stringify({ bookingId }) });
  }

  await db
    .update(schema.bookings)
    .set({
      status: "cancelled",
      cancellation_reason: body.reason,
      cancellation_fee: cancellationFee,
      updated_at: new Date().toISOString(),
    })
    .where(eq(schema.bookings.id, bookingId));

  return c.json({ ok: true, cancellationFee });
});

bookingsRoute.patch("/:id/assign-staff", async (c) => {
  const parsed = z.object({ staff_id: z.string() }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const bookingId = c.req.param("id");

  const [booking] = await db
    .select({ staff_id: schema.bookings.staff_id, scheduled_start: schema.bookings.scheduled_start, scheduled_end: schema.bookings.scheduled_end })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)))
    .limit(1);
  if (!booking) return c.json({ error: "Not found" }, 404);

  if (booking.staff_id) {
    const oldDoId = bookingCalendarId(c.env.BOOKING_CALENDAR, tenantId, booking.staff_id);
    await c.env.BOOKING_CALENDAR.get(oldDoId).fetch("https://do/release", { method: "POST", body: JSON.stringify({ bookingId }) });
  }

  const reserve = await reserveSlot(c.env, tenantId, parsed.data.staff_id, bookingId, booking.scheduled_start, booking.scheduled_end);
  if (!reserve.ok) return c.json({ error: "That staff member is already booked for this slot", conflictBookingId: reserve.conflictBookingId }, 409);

  await db.update(schema.bookings).set({ staff_id: parsed.data.staff_id, updated_at: new Date().toISOString() }).where(eq(schema.bookings.id, bookingId));
  return c.json({ ok: true });
});

const statusSchema = z.object({ status: z.enum(["scheduled", "en_route", "in_progress", "completed", "cancelled"]) });

bookingsRoute.post("/:id/status", async (c) => {
  const parsed = statusSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const bookingId = c.req.param("id");
  if (!(await staffCanActOnBooking(c, db, tenantId, bookingId))) return c.json({ error: "Not your job" }, 403);
  if (!(await staffTransitionAllowed(c, db, bookingId, parsed.data.status))) return c.json({ error: "Invalid job transition" }, 409);
  await recordCompletionIfNew(db, tenantId, bookingId, parsed.data.status);
  await db
    .update(schema.bookings)
    .set({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)));
  let invoiceId: string | undefined;
  if (parsed.data.status === "completed") {
    const invoiceResult = await ensureInvoiceForCompletedBooking(db, tenantId, bookingId);
    invoiceId = invoiceResult.invoiceId;
  }
  return c.json({ ok: true, invoiceId });
});

const checkSchema = z.object({ lat: z.number().optional(), lng: z.number().optional() });

bookingsRoute.post("/:id/checkin", async (c) => {
  const parsed = checkSchema.safeParse(await c.req.json().catch(() => ({})));
  const data = parsed.success ? parsed.data : {};
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const bookingId = c.req.param("id");
  if (!(await staffCanActOnBooking(c, db, tenantId, bookingId))) return c.json({ error: "Not your job" }, 403);
  if (!(await staffTransitionAllowed(c, db, bookingId, "in_progress"))) return c.json({ error: "This job cannot be checked in" }, 409);
  await db
    .update(schema.bookings)
    .set({
      status: "in_progress",
      checkin_at: new Date().toISOString(),
      checkin_lat: data.lat,
      checkin_lng: data.lng,
      updated_at: new Date().toISOString(),
    })
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)));
  return c.json({ ok: true });
});

/** Checking out a job marks it completed and — see lib/billing-on-completion.ts — auto-creates a draft invoice from the service price if one doesn't already exist, so billing follows the completed job automatically. */
bookingsRoute.post("/:id/checkout", async (c) => {
  const parsed = checkSchema.safeParse(await c.req.json().catch(() => ({})));
  const data = parsed.success ? parsed.data : {};
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const bookingId = c.req.param("id");
  if (!(await staffCanActOnBooking(c, db, tenantId, bookingId))) return c.json({ error: "Not your job" }, 403);
  if (!(await staffTransitionAllowed(c, db, bookingId, "completed"))) return c.json({ error: "Check in before completing this job" }, 409);
  await recordCompletionIfNew(db, tenantId, bookingId, "completed");
  await db
    .update(schema.bookings)
    .set({
      status: "completed",
      checkout_at: new Date().toISOString(),
      checkout_lat: data.lat,
      checkout_lng: data.lng,
      updated_at: new Date().toISOString(),
    })
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)));
  const { invoiceId } = await ensureInvoiceForCompletedBooking(db, tenantId, bookingId);
  return c.json({ ok: true, invoiceId });
});
