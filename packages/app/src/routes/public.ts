import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { reserveSlot } from "../lib/booking-lock";
import { createJobReminderTask, createStaffAssignmentTask } from "../lib/tasks";
import { findAvailableStaff } from "../lib/staff-matching";

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

  return c.json({ id: bookingId, scheduled_start: start, scheduled_end: end }, 201);
});
