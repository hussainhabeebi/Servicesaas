import { Hono } from "hono";
import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { bookingCalendarId } from "../durable-objects/booking-calendar";
import { reserveSlot } from "../lib/booking-lock";
import { createJobReminderTask } from "../lib/tasks";

export const bookingsRoute = new Hono<AppContext>();

const CANCELLATION_CUTOFF_HOURS = 24;
const CANCELLATION_FEE_RATE = 0.25;

const createSchema = z.object({
  customer_id: z.string(),
  staff_id: z.string().optional(), // omitted in solo-operator mode
  service_id: z.string(),
  address_id: z.string().optional(),
  scheduled_start: z.string(), // ISO
  scheduled_end: z.string(), // ISO
  recurrence_rule: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  recurrence_count: z.number().int().min(1).max(52).default(1),
  source: z.enum(["app", "whatsapp", "website"]).default("app"),
  notes: z.string().optional(),
});

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

bookingsRoute.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const created: Array<{ id: string; scheduled_start: string; scheduled_end: string }> = [];
  let start = input.scheduled_start;
  let end = input.scheduled_end;
  let parentId: string | undefined;
  const durationMs = new Date(input.scheduled_end).getTime() - new Date(input.scheduled_start).getTime();

  for (let i = 0; i < input.recurrence_count; i++) {
    const bookingId = crypto.randomUUID();
    const reserve = await reserveSlot(c.env, tenantId, input.staff_id, bookingId, start, end);
    if (!reserve.ok) {
      return c.json(
        { error: "Slot conflicts with an existing booking", conflictBookingId: reserve.conflictBookingId, failedAtOccurrence: i },
        409
      );
    }

    await db.insert(schema.bookings).values({
      id: bookingId,
      tenant_id: tenantId,
      customer_id: input.customer_id,
      staff_id: input.staff_id,
      service_id: input.service_id,
      address_id: input.address_id,
      status: "scheduled",
      scheduled_start: start,
      scheduled_end: end,
      recurrence_rule: input.recurrence_rule,
      parent_booking_id: parentId,
      source: input.source,
      notes: input.notes,
    });

    await createJobReminderTask(db, tenantId, bookingId, input.staff_id, start);

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
    .select({ id: schema.bookings.id, staff_id: schema.bookings.staff_id, scheduled_start: schema.bookings.scheduled_start, service_id: schema.bookings.service_id })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)))
    .limit(1);
  if (!booking) return c.json({ error: "Not found" }, 404);

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

const statusSchema = z.object({ status: z.enum(["scheduled", "en_route", "in_progress", "completed", "cancelled"]) });

bookingsRoute.post("/:id/status", async (c) => {
  const parsed = statusSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.bookings)
    .set({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .where(and(eq(schema.bookings.id, c.req.param("id")), eq(schema.bookings.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

const checkSchema = z.object({ lat: z.number().optional(), lng: z.number().optional() });

bookingsRoute.post("/:id/checkin", async (c) => {
  const parsed = checkSchema.safeParse(await c.req.json().catch(() => ({})));
  const data = parsed.success ? parsed.data : {};
  const db = createDb(c.env.DB);
  await db
    .update(schema.bookings)
    .set({
      status: "in_progress",
      checkin_at: new Date().toISOString(),
      checkin_lat: data.lat,
      checkin_lng: data.lng,
      updated_at: new Date().toISOString(),
    })
    .where(and(eq(schema.bookings.id, c.req.param("id")), eq(schema.bookings.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

bookingsRoute.post("/:id/checkout", async (c) => {
  const parsed = checkSchema.safeParse(await c.req.json().catch(() => ({})));
  const data = parsed.success ? parsed.data : {};
  const db = createDb(c.env.DB);
  await db
    .update(schema.bookings)
    .set({
      status: "completed",
      checkout_at: new Date().toISOString(),
      checkout_lat: data.lat,
      checkout_lng: data.lng,
      updated_at: new Date().toISOString(),
    })
    .where(and(eq(schema.bookings.id, c.req.param("id")), eq(schema.bookings.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
