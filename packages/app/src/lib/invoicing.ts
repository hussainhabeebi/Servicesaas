import { eq, and } from "drizzle-orm";
import { createDb, schema, sendChatwootProactiveMessage, type Env } from "@serviceos/platform";
import { renderInvoicePdf } from "./pdf";

/**
 * Renders an invoice PDF, stores it in R2, and sends it to the customer over
 * WhatsApp — shared by the manual "Send" button (routes/invoices.ts) and
 * auto-sent deposit invoices (lib/deposits.ts), which need the exact same
 * behavior without a human clicking anything.
 */
export async function sendInvoiceViaWhatsApp(env: Env, tenantId: string, invoiceId: string): Promise<{ ok: boolean; error?: string; whatsappSent?: boolean }> {
  const db = createDb(env.DB);
  const [invoice] = await db.select().from(schema.invoices).where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.tenant_id, tenantId))).limit(1);
  if (!invoice) return { ok: false, error: "Not found" };
  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, invoice.customer_id)).limit(1);
  const lineItems = await db.select().from(schema.invoiceLineItems).where(eq(schema.invoiceLineItems.invoice_id, invoiceId));
  if (!tenant || !customer) return { ok: false, error: "Missing tenant or customer" };

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
  await env.FILES.put(r2Key, pdfBytes, { httpMetadata: { contentType: "application/pdf" } });

  await db
    .update(schema.invoices)
    .set({ status: "sent", pdf_r2_key: r2Key, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .where(eq(schema.invoices.id, invoiceId));

  const label = invoice.kind === "deposit" ? "deposit invoice" : "invoice";
  const waResult =
    tenant.chatwoot_inbox_id && tenant.chatwoot_account_id
      ? await sendChatwootProactiveMessage(
          { baseUrl: env.CHATWOOT_BASE_URL, apiAccessToken: env.CHATWOOT_AGENT_BOT_TOKEN, accountId: tenant.chatwoot_account_id },
          tenant.chatwoot_inbox_id,
          customer.phone,
          customer.name,
          `Hi ${customer.name}, here's your ${label} ${invoice.invoice_number} from ${tenant.business_name}: ${invoice.currency} ${invoice.total.toFixed(2)}. Total due${invoice.due_date ? ` by ${invoice.due_date}` : ""}.`
        ).catch((e) => ({ ok: false, error: String(e) }))
      : { ok: false, error: "WhatsApp not connected for this tenant" };

  return { ok: true, whatsappSent: waResult.ok };
}
