import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createDb, schema, sendWhatsAppMessage } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { calculateInvoiceTotals, nextInvoiceNumber } from "../lib/vat";
import { renderInvoicePdf } from "../lib/pdf";

export const invoicesRoute = new Hono<AppContext>();

const lineItemSchema = z.object({
  kind: z.enum(["labor", "materials", "addon"]).default("labor"),
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unit_price: z.number().nonnegative(),
});

const createSchema = z.object({
  customer_id: z.string(),
  booking_id: z.string().optional(),
  line_items: z.array(lineItemSchema).min(1),
  due_date: z.string().optional(),
});

invoicesRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.tenant_id, c.get("tenantId")))
    .orderBy(desc(schema.invoices.created_at));
  return c.json({ invoices: rows });
});

invoicesRoute.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const [tenant] = await db.select({ vat_rate: schema.tenants.vat_rate, slug: schema.tenants.slug }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!tenant) return c.json({ error: "Tenant not found" }, 404);

  const priced = input.line_items.map((li) => ({ ...li, total: Math.round(li.quantity * li.unit_price * 100) / 100 }));
  const { subtotal, vat_amount, total } = calculateInvoiceTotals(priced, tenant.vat_rate);

  const existingCount = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.tenant_id, tenantId));
  const invoiceNumber = nextInvoiceNumber(existingCount.length + 1, tenant.slug);

  const invoiceId = crypto.randomUUID();
  await db.insert(schema.invoices).values({
    id: invoiceId,
    tenant_id: tenantId,
    booking_id: input.booking_id,
    customer_id: input.customer_id,
    invoice_number: invoiceNumber,
    status: "draft",
    subtotal,
    vat_amount,
    total,
    currency: "AED",
    due_date: input.due_date,
  });

  await db.insert(schema.invoiceLineItems).values(
    priced.map((li) => ({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      invoice_id: invoiceId,
      kind: li.kind,
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
      total: li.total,
    }))
  );

  return c.json({ id: invoiceId, invoice_number: invoiceNumber, subtotal, vat_amount, total }, 201);
});

invoicesRoute.get("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.id, c.req.param("id")), eq(schema.invoices.tenant_id, c.get("tenantId"))))
    .limit(1);
  if (!invoice) return c.json({ error: "Not found" }, 404);
  const lineItems = await db.select().from(schema.invoiceLineItems).where(eq(schema.invoiceLineItems.invoice_id, invoice.id));
  const paymentRows = await db.select().from(schema.payments).where(eq(schema.payments.invoice_id, invoice.id));
  return c.json({ invoice, lineItems, payments: paymentRows });
});

/** Renders the invoice PDF, stores it in R2, and sends it to the customer over WhatsApp. */
invoicesRoute.post("/:id/send", async (c) => {
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const invoiceId = c.req.param("id");

  const [invoice] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.tenant_id, tenantId))).limit(1);
  if (!invoice) return c.json({ error: "Not found" }, 404);
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, invoice.customer_id)).limit(1);
  const lineItems = await db.select().from(schema.invoiceLineItems).where(eq(schema.invoiceLineItems.invoice_id, invoiceId));
  if (!tenant || !customer) return c.json({ error: "Missing tenant or customer" }, 400);

  const pdfBytes = await renderInvoicePdf({
    tenantName: tenant.business_name,
    tenantAddress: tenant.address,
    invoiceNumber: invoice.invoice_number,
    issuedDate: invoice.created_at.slice(0, 10),
    dueDate: invoice.due_date,
    customerName: customer.name,
    currency: invoice.currency,
    lineItems,
    subtotal: invoice.subtotal,
    vatAmount: invoice.vat_amount,
    vatRate: tenant.vat_rate,
    total: invoice.total,
  });

  const r2Key = `${tenantId}/invoices/${invoice.invoice_number}.pdf`;
  await c.env.FILES.put(r2Key, pdfBytes, { httpMetadata: { contentType: "application/pdf" } });

  await db
    .update(schema.invoices)
    .set({ status: "sent", pdf_r2_key: r2Key, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .where(eq(schema.invoices.id, invoiceId));

  const [waMapping] = await db.select({ phone_number_id: schema.waPhoneMapping.phone_number_id }).from(schema.waPhoneMapping).where(eq(schema.waPhoneMapping.tenant_id, tenantId)).limit(1);
  const waResult = waMapping
    ? await sendWhatsAppMessage(c.env.WA_ACCESS_TOKEN, waMapping.phone_number_id, {
        to: customer.phone,
        body: `Hi ${customer.name}, here's your invoice ${invoice.invoice_number} from ${tenant.business_name}: ${invoice.currency} ${invoice.total.toFixed(2)}. Total due${invoice.due_date ? ` by ${invoice.due_date}` : ""}.`,
      }).catch((e) => ({ ok: false, error: String(e) }))
    : { ok: false, error: "No WhatsApp number configured for this tenant" };

  return c.json({ ok: true, r2Key, whatsappSent: waResult.ok });
});

const recordPaymentSchema = z.object({
  method: z.enum(["cash", "card", "bank_transfer", "payment_link"]),
  gateway: z.enum(["razorpay", "phonepe", "telr", "network_international"]).optional(),
  gateway_ref: z.string().optional(),
  amount: z.number().positive(),
});

invoicesRoute.post("/:id/payments", async (c) => {
  const parsed = recordPaymentSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const invoiceId = c.req.param("id");

  const [invoice] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.tenant_id, tenantId))).limit(1);
  if (!invoice) return c.json({ error: "Not found" }, 404);

  await db.insert(schema.payments).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    invoice_id: invoiceId,
    method: parsed.data.method,
    gateway: parsed.data.gateway,
    gateway_ref: parsed.data.gateway_ref,
    amount: parsed.data.amount,
    status: "success",
    paid_at: new Date().toISOString(),
  });

  const amountPaid = invoice.amount_paid + parsed.data.amount;
  const status = amountPaid >= invoice.total ? "paid" : "partial";
  await db
    .update(schema.invoices)
    .set({ amount_paid: amountPaid, status, paid_at: status === "paid" ? new Date().toISOString() : invoice.paid_at, updated_at: new Date().toISOString() })
    .where(eq(schema.invoices.id, invoiceId));

  return c.json({ ok: true, status });
});
