import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { reserveSlot } from "../lib/booking-lock";
import { createJobReminderTask, createStaffAssignmentTask } from "../lib/tasks";
import { findAvailableStaff } from "../lib/staff-matching";
import { createAndSendDepositInvoice } from "../lib/deposits";
import { getRebookSuggestion, getAddOnSuggestions, getBestSlots } from "../lib/suggestions";
import { geminiConciergeReply } from "../lib/gemini";

/**
 * Unauthenticated storefront endpoints for the tenant's website booking
 * widget (spec §8) — tenant is resolved from the Host header by
 * tenantResolutionMiddleware, not from a bearer token, since site visitors
 * aren't logged in.
 */
export const publicRoute = new Hono<AppContext>();

publicRoute.get("/services", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select({ id: schema.services.id, name: schema.services.name, category: schema.services.category, duration_minutes: schema.services.duration_minutes, price: schema.services.price, description: schema.services.description })
    .from(schema.services)
    .where(and(eq(schema.services.tenant_id, c.get("tenantId")), eq(schema.services.active, true)));
  return c.json({ services: rows });
});

/** Instant quote calculator — a straightforward size/type multiplier on the base service price until per-vertical pricing rules exist. */
publicRoute.get("/quote", async (c) => {
  const db = createDb(c.env.DB);
  const serviceId = c.req.query("service_id");
  const sizeMultiplier = Number(c.req.query("size_multiplier") ?? "1") || 1;
  if (!serviceId) return c.json({ error: "service_id is required" }, 400);
  const [service] = await db.select().from(schema.services).where(and(eq(schema.services.id, serviceId), eq(schema.services.tenant_id, c.get("tenantId")))).limit(1);
  if (!service) return c.json({ error: "Service not found" }, 404);
  const estimate = Math.round(service.price * Math.max(0.5, Math.min(sizeMultiplier, 5)) * 100) / 100;
  return c.json({ estimate, currency: "AED", durationMinutes: service.duration_minutes });
});

const bookingSchema = z.object({
  service_id: z.string(),
  customer_name: z.string().min(1),
  customer_phone: z.string().min(6),
  customer_email: z.string().email().optional(),
  address_line: z.string().optional(),
  area: z.string().optional(),
  scheduled_start: z.string(),
});

publicRoute.post("/bookings", async (c) => {
  const parsed = bookingSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const [service] = await db.select().from(schema.services).where(and(eq(schema.services.id, input.service_id), eq(schema.services.tenant_id, tenantId))).limit(1);
  if (!service) return c.json({ error: "Service not found" }, 404);

  const [existingCustomer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.tenant_id, tenantId), eq(schema.customers.phone, input.customer_phone))).limit(1);
  let customerId = existingCustomer?.id;
  if (!customerId) {
    customerId = crypto.randomUUID();
    await db.insert(schema.customers).values({ id: customerId, tenant_id: tenantId, name: input.customer_name, phone: input.customer_phone, email: input.customer_email });
  }

  let addressId: string | undefined;
  if (input.address_line) {
    addressId = crypto.randomUUID();
    await db.insert(schema.customerAddresses).values({ id: addressId, tenant_id: tenantId, customer_id: customerId, address_line: input.address_line, area: input.area, is_default: true });
  }

  const start = input.scheduled_start;
  const end = new Date(new Date(start).getTime() + service.duration_minutes * 60_000).toISOString();

  // Best-effort auto-assign by area/availability — never blocks a
  // customer-facing booking, just leaves a task for manual assignment when
  // no crew member matches (see createStaffAssignmentTask below).
  const [anyStaff] = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.tenant_id, tenantId), eq(schema.staff.active, true))).limit(1);
  let staffId: string | undefined;
  let autoAssignFailed = false;
  if (anyStaff) {
    const [tenant] = await db.select({ timezone: schema.tenants.timezone }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
    const candidates = await findAvailableStaff(db, tenantId, { area: input.area, start, end, timezone: tenant?.timezone ?? "Asia/Dubai" });
    staffId = candidates[0]?.id;
    autoAssignFailed = candidates.length === 0;
  }

  const bookingId = crypto.randomUUID();
  const reserve = await reserveSlot(c.env, tenantId, staffId, bookingId, start, end);
  if (!reserve.ok) return c.json({ error: "That slot was just booked — please pick another time" }, 409);

  await db.insert(schema.bookings).values({
    id: bookingId,
    tenant_id: tenantId,
    customer_id: customerId,
    service_id: service.id,
    address_id: addressId,
    area: input.area,
    staff_id: staffId,
    status: "scheduled",
    scheduled_start: start,
    scheduled_end: end,
    source: "website",
  });
  await createJobReminderTask(db, tenantId, bookingId, staffId, start);
  if (autoAssignFailed) await createStaffAssignmentTask(db, tenantId, bookingId, input.area, start);

  const deposit = await createAndSendDepositInvoice(c.env, tenantId, { bookingId, customerId, service }).catch(() => ({ ok: false as const }));

  return c.json({ id: bookingId, scheduled_start: start, scheduled_end: end, depositRequired: deposit.ok ? deposit.amount : null }, 201);
});

// --- Suggestions (customer-facing) -----------------------------------------

/** Rebook nudge for a returning customer — the widget calls this with the phone number remembered locally from a previous booking. */
publicRoute.get("/suggestions/rebook", async (c) => {
  const phone = c.req.query("phone");
  if (!phone) return c.json({ suggestion: null });
  const db = createDb(c.env.DB);
  const suggestion = await getRebookSuggestion(db, c.get("tenantId"), phone);
  return c.json({ suggestion });
});

/** "Customers who booked this also booked…" for the checkout add-on chips. */
publicRoute.get("/suggestions/addons", async (c) => {
  const serviceId = c.req.query("service_id");
  if (!serviceId) return c.json({ error: "service_id is required" }, 400);
  const exclude = (c.req.query("exclude") ?? "").split(",").filter(Boolean);
  const db = createDb(c.env.DB);
  const suggestions = await getAddOnSuggestions(db, c.get("tenantId"), serviceId, { exclude });
  return c.json({ suggestions });
});

/** Recommended time slots for a given service/day, so the booking modal can highlight a few good options instead of a flat calendar. */
publicRoute.get("/suggestions/best-slots", async (c) => {
  const serviceId = c.req.query("service_id");
  const date = c.req.query("date"); // YYYY-MM-DD
  if (!serviceId || !date) return c.json({ error: "service_id and date are required" }, 400);
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const [tenant] = await db.select({ timezone: schema.tenants.timezone }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const slots = await getBestSlots(db, tenantId, { serviceId, dateIso: date, timezone: tenant?.timezone ?? "Asia/Dubai" });
  return c.json({ slots });
});

// --- AI concierge ------------------------------------------------------------

const conciergeSchema = z.object({
  message: z.string().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })).max(20).default([]),
});

publicRoute.post("/concierge", async (c) => {
  const parsed = conciergeSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const [tenant] = await db.select({ business_name: schema.tenants.business_name, currency: schema.tenants.currency }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const services = await db
    .select({ id: schema.services.id, name: schema.services.name, category: schema.services.category, price: schema.services.price })
    .from(schema.services)
    .where(and(eq(schema.services.tenant_id, tenantId), eq(schema.services.active, true)));
  if (!tenant) return c.json({ error: "Not found" }, 404);

  const result = await geminiConciergeReply(c.env.GEMINI_API_KEY, c.env.GEMINI_MODEL, {
    businessName: tenant.business_name,
    services,
    currency: tenant.currency,
    history: parsed.data.history,
    message: parsed.data.message,
  });
  if (!result) return c.json({ reply: "Sorry, I couldn't quite catch that — you can also tap Book Now to browse services directly.", matchedServiceId: null, openBooking: false });
  return c.json(result);
});

// --- Web Push subscriptions ---------------------------------------------------

/** The widget needs this as PushManager's applicationServerKey — kept server-side rather than baked into the site bundle since it's per-environment. */
publicRoute.get("/push/vapid-public-key", (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY ?? null }));

const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  customer_phone: z.string().optional(), // links the subscription to a known customer for targeted reminders, when available
});

publicRoute.post("/push/subscribe", async (c) => {
  const parsed = pushSubscribeSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  let customerId: string | undefined;
  if (input.customer_phone) {
    const [customer] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.tenant_id, tenantId), eq(schema.customers.phone, input.customer_phone))).limit(1);
    customerId = customer?.id;
  }

  const [existing] = await db.select({ id: schema.pushSubscriptions.id }).from(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.tenant_id, tenantId), eq(schema.pushSubscriptions.endpoint, input.endpoint))).limit(1);
  if (existing) {
    await db.update(schema.pushSubscriptions).set({ p256dh: input.keys.p256dh, auth: input.keys.auth, customer_id: customerId }).where(eq(schema.pushSubscriptions.id, existing.id));
    return c.json({ ok: true });
  }

  await db.insert(schema.pushSubscriptions).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    customer_id: customerId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  });
  return c.json({ ok: true }, 201);
});
