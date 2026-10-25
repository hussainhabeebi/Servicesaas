import { and, eq } from "drizzle-orm";
import { createDb, schema, sendChatwootProactiveMessage, type Env } from "@serviceos/platform";
import { getChatwootConfig } from "./chatwoot-config";

/** One immutable charge per completed booking. D1 batch makes the ledger,
 * invoice line, totals and loyalty update atomic, including concurrent retries. */
export async function ensureInvoiceForCompletedBooking(env: Env, tenantId: string, bookingId: string) {
 const db = createDb(env.DB);
 const [booking] = await db.select().from(schema.bookings).where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId))).limit(1);
 if (!booking || booking.status !== "completed") return { created: false };
 const [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, booking.customer_id), eq(schema.customers.tenant_id, tenantId))).limit(1);
 const [service] = await db.select().from(schema.services).where(and(eq(schema.services.id, booking.service_id), eq(schema.services.tenant_id, tenantId))).limit(1);
 const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
 if (!customer || !service || !tenant) throw new Error("Missing billing details");
 const date = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(booking.scheduled_start));
 let period = date.slice(0, 7);
 if (customer.billing_cycle === "weekly") {
   const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); period = d.toISOString().slice(0, 10);
 }
 if (customer.billing_cycle === "per_service") period = bookingId;
 const invoiceId = `cycle:${tenantId}:${customer.id}:${customer.billing_cycle}:${period}`;
 // Never append to a sent/paid invoice; start a supplemental draft for this visit.
 const [cycleInvoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoiceId)).limit(1);
 const targetId = cycleInvoice && cycleInvoice.status !== "draft" ? `${invoiceId}:${bookingId}` : invoiceId;
 const existing = await env.DB.prepare("SELECT invoice_id FROM service_completions WHERE booking_id=? AND tenant_id=?").bind(bookingId, tenantId).first<{ invoice_id: string }>();
 if (existing) return { created: false, invoiceId: existing.invoice_id };
 const oldInvoice = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(and(eq(schema.invoices.tenant_id, tenantId), eq(schema.invoices.booking_id, bookingId), eq(schema.invoices.kind, "standard"))).limit(1);
 // Preserve charges created before cycle billing was enabled.
 if (oldInvoice[0]) return { created: false, invoiceId: oldInvoice[0].id };
 const amount = service.price;
 const stamp = new Date().toISOString();
 await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO invoices (id,tenant_id,customer_id,invoice_number,kind,status,subtotal,vat_amount,total,currency) VALUES (?,?,?,?,'standard','draft',0,0,0,?)").bind(targetId, tenantId, customer.id, `CYCLE-${period}-${crypto.randomUUID().slice(0,8)}`, tenant.currency),
   env.DB.prepare("INSERT OR IGNORE INTO invoice_line_items (id,tenant_id,invoice_id,kind,description,quantity,unit_price,total) VALUES (?,?,?,'labor',?,1,?,?)").bind(`visit:${bookingId}`, tenantId, targetId, `${service.name} · ${date}`, amount, amount),
   env.DB.prepare("INSERT OR IGNORE INTO service_completions (booking_id,tenant_id,customer_id,invoice_id,service_date,amount) VALUES (?,?,?,?,?,?)").bind(bookingId,tenantId,customer.id,targetId,date,amount),
   env.DB.prepare("UPDATE invoices SET subtotal=(SELECT COALESCE(SUM(total),0) FROM invoice_line_items WHERE invoice_id=?), vat_amount=ROUND((SELECT COALESCE(SUM(total),0) FROM invoice_line_items WHERE invoice_id=?)*?,2), total=ROUND((SELECT COALESCE(SUM(total),0) FROM invoice_line_items WHERE invoice_id=?)*(1+?),2), updated_at=? WHERE id=?").bind(targetId,targetId,tenant.vat_rate,targetId,tenant.vat_rate,stamp,targetId),
   env.DB.prepare("UPDATE customers SET completed_bookings_count=(SELECT COUNT(*) FROM bookings WHERE customer_id=? AND tenant_id=? AND status='completed'), updated_at=? WHERE id=? AND tenant_id=?").bind(customer.id,tenantId,stamp,customer.id,tenantId)
 ]);
 return { created: true, invoiceId: targetId };
}

/** Pending delivery remains visible and is retried by cron; completion never
 * fails merely because messaging is disconnected or temporarily unavailable. */
export async function sendCompletionNotifications(env: Env, tenantId: string) {
 await env.DB.prepare("UPDATE service_completions SET notification_status='pending' WHERE tenant_id=? AND notification_status='sending' AND notification_attempt_at < ?").bind(tenantId, new Date(Date.now() - 600000).toISOString()).run();
 const rows = await env.DB.prepare(`SELECT s.*, c.name, c.phone, t.business_name, t.currency, t.chatwoot_inbox_id FROM service_completions s JOIN customers c ON c.id=s.customer_id JOIN tenants t ON t.id=s.tenant_id WHERE s.tenant_id=? AND s.notification_status='pending' LIMIT 25`).bind(tenantId).all<{ booking_id: string; name: string; phone: string; business_name: string; currency: string; chatwoot_inbox_id: number; service_date: string; amount: number }>();
 for (const row of rows.results) {
   // Atomic claim prevents a checkout and cron from delivering simultaneously.
   const claim = await env.DB.prepare("UPDATE service_completions SET notification_status='sending', notification_attempt_at=? WHERE booking_id=? AND notification_status='pending'").bind(new Date().toISOString(), row.booking_id).run();
   if (!claim.meta.changes) continue;
   const result = await (async () => {
     const config = await getChatwootConfig(env, tenantId);
     return sendChatwootProactiveMessage(config, row.chatwoot_inbox_id, row.phone, row.name, `Hi ${row.name}, your service on ${row.service_date} is completed. ${row.currency} ${row.amount.toFixed(2)} has been added to your billing cycle with ${row.business_name}. Thank you!`);
   })().catch(() => ({ ok: false }));
   await env.DB.prepare("UPDATE service_completions SET notification_status=?, notification_error=? WHERE booking_id=?").bind(result.ok ? "sent" : "pending", result.ok ? null : "Delivery failed; will retry. Check messaging connection and WhatsApp session/template requirements.", row.booking_id).run();
 }
}
