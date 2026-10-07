import { Hono } from "hono";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { createDb, schema, hashPassword, verifyPassword, type AppContext } from "@serviceos/platform";
import { bookingsRoute } from "./bookings";

export const staffPortalRoute = new Hono<AppContext>();
staffPortalRoute.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
staffPortalRoute.post("/password", async (c) => {
  const parsed = z.object({ current_password: z.string().max(128), password: z.string().min(12).max(128) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Use at least 12 characters" }, 400);
  const db = createDb(c.env.DB);
  const [user] = await db.select().from(schema.tenantUsers).where(and(eq(schema.tenantUsers.id, c.get("tenantUserId")!), eq(schema.tenantUsers.tenant_id, c.get("tenantId")))).limit(1);
  if (!user || !(await verifyPassword(parsed.data.current_password, user.password_hash))) return c.json({ error: "Incorrect current password" }, 400);
  await db.update(schema.tenantUsers).set({ password_hash: await hashPassword(parsed.data.password), session_version: sql`${schema.tenantUsers.session_version} + 1`, updated_at: new Date().toISOString() }).where(eq(schema.tenantUsers.id, user.id));
  return c.json({ ok: true, loginRequired: true });
});
staffPortalRoute.post("/logout", async (c) => {
  await createDb(c.env.DB).update(schema.tenantUsers).set({ session_version: sql`${schema.tenantUsers.session_version} + 1` }).where(eq(schema.tenantUsers.id, c.get("tenantUserId")!));
  return c.json({ ok: true });
});
staffPortalRoute.get("/me", async (c) => {
  const db = createDb(c.env.DB);
  const [staff] = await db.select().from(schema.staff).where(and(eq(schema.staff.id, c.get("staffId")!), eq(schema.staff.tenant_id, c.get("tenantId")))).limit(1);
  const availability = await db.select().from(schema.staffAvailability).where(and(eq(schema.staffAvailability.staff_id, c.get("staffId")!), eq(schema.staffAvailability.tenant_id, c.get("tenantId"))));
  return c.json({ staff, availability });
});
staffPortalRoute.get("/jobs", async (c) => {
  const db = createDb(c.env.DB);
  const jobs = await db.select({ booking: schema.bookings, customer: { name: schema.customers.name, phone: schema.customers.phone }, service: { name: schema.services.name }, address: { address_line: schema.customerAddresses.address_line, area: schema.customerAddresses.area, city: schema.customerAddresses.city } }).from(schema.bookings)
    .leftJoin(schema.customers, and(eq(schema.customers.id, schema.bookings.customer_id), eq(schema.customers.tenant_id, schema.bookings.tenant_id)))
    .leftJoin(schema.services, and(eq(schema.services.id, schema.bookings.service_id), eq(schema.services.tenant_id, schema.bookings.tenant_id)))
    .leftJoin(schema.customerAddresses, and(eq(schema.customerAddresses.id, schema.bookings.address_id), eq(schema.customerAddresses.tenant_id, schema.bookings.tenant_id)))
    .where(and(eq(schema.bookings.tenant_id, c.get("tenantId")), eq(schema.bookings.staff_id, c.get("staffId")!)));
  return c.json({ jobs, performance: { assigned: jobs.length, completed: jobs.filter(j => j.booking.status === "completed").length } });
});
staffPortalRoute.patch("/me", async (c) => {
  const parsed = z.object({ service_areas: z.array(z.string().min(1).max(100)).max(30) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid service areas" }, 400);
  await createDb(c.env.DB).update(schema.staff).set({ ...parsed.data, updated_at: new Date().toISOString() }).where(and(eq(schema.staff.id, c.get("staffId")!), eq(schema.staff.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
staffPortalRoute.post("/availability", async (c) => {
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const parsed = z.object({ day_of_week: z.number().int().min(0).max(6), start_time: time, end_time: time }).refine(v => v.end_time > v.start_time).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Choose a valid working-hours range" }, 400);
  const id = crypto.randomUUID();
  await createDb(c.env.DB).insert(schema.staffAvailability).values({ id, tenant_id: c.get("tenantId"), staff_id: c.get("staffId")!, ...parsed.data });
  return c.json({ id }, 201);
});
staffPortalRoute.delete("/availability/:id", async (c) => {
  await createDb(c.env.DB).delete(schema.staffAvailability).where(and(eq(schema.staffAvailability.id, c.req.param("id")), eq(schema.staffAvailability.tenant_id, c.get("tenantId")), eq(schema.staffAvailability.staff_id, c.get("staffId")!)));
  return c.json({ ok: true });
});
staffPortalRoute.get("/tasks", async (c) => {
  const tasks = await createDb(c.env.DB).select().from(schema.tasks).where(and(eq(schema.tasks.tenant_id, c.get("tenantId")), eq(schema.tasks.assigned_staff_id, c.get("staffId")!)));
  return c.json({ tasks });
});
staffPortalRoute.patch("/tasks/:id/done", async (c) => {
  const rows = await createDb(c.env.DB).update(schema.tasks).set({ status: "done" }).where(and(eq(schema.tasks.id, c.req.param("id")), eq(schema.tasks.tenant_id, c.get("tenantId")), eq(schema.tasks.assigned_staff_id, c.get("staffId")!))).returning({ id: schema.tasks.id });
  return rows.length ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
});
staffPortalRoute.use("/bookings/*", async (c, next) => {
  if (c.req.method !== "POST" || !/\/bookings\/[^/]+\/(status|checkin|checkout)$/.test(c.req.path)) return c.json({ error: "Not found" }, 404);
  await next();
});
staffPortalRoute.route("/bookings", bookingsRoute);
