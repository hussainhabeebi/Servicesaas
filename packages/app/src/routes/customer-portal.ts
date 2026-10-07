import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { createDb, schema, hashPassword, verifyPassword, type AppContext } from "@serviceos/platform";
import { requireCustomerAuth } from "./customer-auth";
import { bookingsRoute } from "./bookings";
import { paymentsRoute } from "./payments";
import { getGateway } from "../lib/payment-gateways";
import { renderInvoicePdf } from "../lib/pdf";

export const customerPortalRoute = new Hono<AppContext>();
customerPortalRoute.use("*", requireCustomerAuth);

customerPortalRoute.get("/me", async (c) => {
  const db = createDb(c.env.DB);
  const [customer] = await db.select({ id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone, email: schema.customers.email, preferences: schema.customers.preferences, completed_bookings_count: schema.customers.completed_bookings_count, is_repeat_customer: schema.customers.is_repeat_customer }).from(schema.customers).where(and(eq(schema.customers.id, c.get("customerId")!), eq(schema.customers.tenant_id, c.get("tenantId")))).limit(1);
  const [business] = await db.select({ currency: schema.tenants.currency, timezone: schema.tenants.timezone }).from(schema.tenants).where(eq(schema.tenants.id, c.get("tenantId"))).limit(1);
  return customer ? c.json({ customer, business }) : c.json({ error: "Not found" }, 404);
});
customerPortalRoute.patch("/me", async (c) => {
  const parsed = z.object({ name: z.string().min(1).max(120), email: z.string().email().max(254).nullable().optional(), preferences: z.record(z.string().max(500)).optional() }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid profile" }, 400);
  await createDb(c.env.DB).update(schema.customers).set({ ...parsed.data, updated_at: new Date().toISOString() }).where(and(eq(schema.customers.id, c.get("customerId")!), eq(schema.customers.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
customerPortalRoute.post("/password", async (c) => {
  const parsed = z.object({ current_password: z.string().max(128), password: z.string().min(12).max(128) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Use at least 12 characters" }, 400);
  const db = createDb(c.env.DB);
  const [account] = await db.select().from(schema.customerAccounts).where(eq(schema.customerAccounts.id, c.get("customerAccountId")!)).limit(1);
  if (!account?.password_hash || !(await verifyPassword(parsed.data.current_password, account.password_hash))) return c.json({ error: "Incorrect current password" }, 400);
  await db.update(schema.customerAccounts).set({ password_hash: await hashPassword(parsed.data.password), session_version: sql`${schema.customerAccounts.session_version} + 1` }).where(eq(schema.customerAccounts.id, account.id));
  return c.json({ ok: true, loginRequired: true });
});
customerPortalRoute.post("/logout", async (c) => {
  await createDb(c.env.DB).update(schema.customerAccounts).set({ session_version: sql`${schema.customerAccounts.session_version} + 1` }).where(eq(schema.customerAccounts.id, c.get("customerAccountId")!));
  return c.json({ ok: true });
});

customerPortalRoute.get("/addresses", async (c) => {
  const addresses = await createDb(c.env.DB).select().from(schema.customerAddresses).where(and(eq(schema.customerAddresses.tenant_id, c.get("tenantId")), eq(schema.customerAddresses.customer_id, c.get("customerId")!)));
  return c.json({ addresses });
});
customerPortalRoute.post("/addresses", async (c) => {
  const parsed = z.object({ label: z.string().min(1).max(50).default("Home"), address_line: z.string().min(1).max(500), area: z.string().max(100).optional(), city: z.string().max(100).optional() }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid address" }, 400);
  const id = crypto.randomUUID();
  await createDb(c.env.DB).insert(schema.customerAddresses).values({ id, tenant_id: c.get("tenantId"), customer_id: c.get("customerId")!, ...parsed.data });
  return c.json({ id }, 201);
});

// Only customer-owned actions reach the shared booking handlers. Customers never receive business JWTs.
customerPortalRoute.use("/bookings/*", async (c, next) => {
  const path = new URL(c.req.url).pathname.replace(/^\/customer\/bookings/, "");
  if ((path === "" || path === "/") && ["GET", "POST"].includes(c.req.method)) return next();
  const match = path.match(/^\/([^/]+)\/(reschedule|cancel)$/);
  if (!match || c.req.method !== (match[2] === "reschedule" ? "PATCH" : "POST")) return c.json({ error: "Not found" }, 404);
  const [booking] = await createDb(c.env.DB).select().from(schema.bookings).where(and(eq(schema.bookings.id, match[1]!), eq(schema.bookings.tenant_id, c.get("tenantId")), eq(schema.bookings.customer_id, c.get("customerId")!))).limit(1);
  if (!booking) return c.json({ error: "Not found" }, 404);
  if (!["scheduled", "en_route"].includes(booking.status)) return c.json({ error: "This booking can no longer be changed" }, 409);
  await next();
});
customerPortalRoute.route("/bookings", bookingsRoute);

customerPortalRoute.get("/invoices", async (c) => {
  const invoices = await createDb(c.env.DB).select({ id: schema.invoices.id, invoice_number: schema.invoices.invoice_number, kind: schema.invoices.kind, status: schema.invoices.status, subtotal: schema.invoices.subtotal, vat_amount: schema.invoices.vat_amount, total: schema.invoices.total, amount_paid: schema.invoices.amount_paid, currency: schema.invoices.currency, due_date: schema.invoices.due_date }).from(schema.invoices).where(and(eq(schema.invoices.tenant_id, c.get("tenantId")), eq(schema.invoices.customer_id, c.get("customerId")!), ne(schema.invoices.status, "draft"))).orderBy(desc(schema.invoices.created_at));
  const gateways = ["razorpay", "phonepe", "telr", "network_international"].filter(name => getGateway(c.env, name));
  return c.json({ invoices, gateways });
});
customerPortalRoute.get("/invoices/:id/pdf", async (c) => {
  const db = createDb(c.env.DB);
  const [invoice] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, c.req.param("id")), eq(schema.invoices.tenant_id, c.get("tenantId")), eq(schema.invoices.customer_id, c.get("customerId")!), ne(schema.invoices.status, "draft"))).limit(1);
  if (!invoice) return c.json({ error: "Not found" }, 404);
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, c.get("tenantId"))).limit(1);
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, c.get("customerId")!)).limit(1);
  if (!tenant || !customer) return c.json({ error: "Not found" }, 404);
  const lineItems = await db.select().from(schema.invoiceLineItems).where(and(eq(schema.invoiceLineItems.tenant_id, c.get("tenantId")), eq(schema.invoiceLineItems.invoice_id, invoice.id)));
  const bytes = await renderInvoicePdf({ tenantName: tenant.business_name, tenantAddress: tenant.address, customerName: customer.name, invoiceNumber: invoice.invoice_number, issuedDate: invoice.created_at.slice(0, 10), dueDate: invoice.due_date, currency: invoice.currency, lineItems, subtotal: invoice.subtotal, vatAmount: invoice.vat_amount, vatRate: tenant.vat_rate, total: invoice.total });
  return new Response(bytes as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="invoice.pdf"', "Cache-Control": "no-store" } });
});
customerPortalRoute.use("/payments/*", async (c, next) => {
  if (!c.req.path.endsWith("/payments/link") || c.req.method !== "POST") return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.invoice_id !== "string") return c.json({ error: "Invoice required" }, 400);
  const [invoice] = await createDb(c.env.DB).select().from(schema.invoices).where(and(eq(schema.invoices.id, body.invoice_id), eq(schema.invoices.tenant_id, c.get("tenantId")), eq(schema.invoices.customer_id, c.get("customerId")!))).limit(1);
  if (!invoice || !["sent", "partial", "overdue"].includes(invoice.status) || invoice.total <= invoice.amount_paid) return c.json({ error: "No payable invoice found" }, 404);
  if (body.redirect_url) return c.json({ error: "Custom redirect not permitted" }, 400);
  await next();
});
customerPortalRoute.route("/payments", paymentsRoute);

customerPortalRoute.get("/reviews", async (c) => {
  const reviews = await createDb(c.env.DB).select().from(schema.reviews).where(and(eq(schema.reviews.tenant_id, c.get("tenantId")), eq(schema.reviews.customer_id, c.get("customerId")!)));
  return c.json({ reviews });
});
customerPortalRoute.post("/reviews", async (c) => {
  const parsed = z.object({ booking_id: z.string(), rating: z.number().int().min(1).max(5), comment: z.string().max(2000).default("") }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Rating must be between 1 and 5" }, 400);
  const db = createDb(c.env.DB);
  const [booking] = await db.select().from(schema.bookings).where(and(eq(schema.bookings.id, parsed.data.booking_id), eq(schema.bookings.tenant_id, c.get("tenantId")), eq(schema.bookings.customer_id, c.get("customerId")!), eq(schema.bookings.status, "completed"))).limit(1);
  if (!booking) return c.json({ error: "Only completed visits can be reviewed" }, 400);
  const [existing] = await db.select().from(schema.reviews).where(and(eq(schema.reviews.tenant_id, c.get("tenantId")), eq(schema.reviews.booking_id, booking.id), eq(schema.reviews.customer_id, c.get("customerId")!))).limit(1);
  const data = { rating: parsed.data.rating, comment: parsed.data.comment, submitted_at: new Date().toISOString() };
  if (existing) await db.update(schema.reviews).set(data).where(eq(schema.reviews.id, existing.id));
  else await db.insert(schema.reviews).values({ id: crypto.randomUUID(), tenant_id: c.get("tenantId"), customer_id: c.get("customerId")!, booking_id: booking.id, ...data });
  return c.json({ ok: true });
});
customerPortalRoute.get("/referrals", async (c) => {
  const referrals = await createDb(c.env.DB).select({ id: schema.referrals.id, referred_name: schema.referrals.referred_name, reward_status: schema.referrals.reward_status, reward_description: schema.referrals.reward_description }).from(schema.referrals).where(and(eq(schema.referrals.tenant_id, c.get("tenantId")), eq(schema.referrals.referring_customer_id, c.get("customerId")!)));
  return c.json({ referrals });
});
customerPortalRoute.post("/referrals", async (c) => {
  const parsed = z.object({ referred_name: z.string().min(1).max(120), referred_phone: z.string().min(6).max(40) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Name and phone required" }, 400);
  await createDb(c.env.DB).insert(schema.referrals).values({ id: crypto.randomUUID(), tenant_id: c.get("tenantId"), referring_customer_id: c.get("customerId")!, ...parsed.data });
  return c.json({ ok: true }, 201);
});
customerPortalRoute.post("/push/subscribe", async (c) => {
  const parsed = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().max(256), auth: z.string().max(256) }) }).safeParse(await c.req.json());
  if (!parsed.success || !parsed.data.endpoint.startsWith("https://")) return c.json({ error: "Invalid subscription" }, 400);
  const db = createDb(c.env.DB);
  const data = { tenant_id: c.get("tenantId"), customer_id: c.get("customerId")!, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth };
  const [existing] = await db.select().from(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.tenant_id, data.tenant_id), eq(schema.pushSubscriptions.endpoint, data.endpoint))).limit(1);
  if (existing) await db.update(schema.pushSubscriptions).set(data).where(eq(schema.pushSubscriptions.id, existing.id));
  else await db.insert(schema.pushSubscriptions).values({ id: crypto.randomUUID(), ...data });
  return c.json({ ok: true });
});
