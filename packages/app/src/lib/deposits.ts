import { eq } from "drizzle-orm";
import { createDb, schema, type Env } from "@serviceos/platform";
import { calculateInvoiceTotals, nextInvoiceNumber } from "./vat";
import { sendInvoiceViaWhatsApp } from "./invoicing";

export interface DepositService {
  id: string;
  name: string;
  price: number;
  deposit_type: string;
  deposit_value: number;
}

export function depositAmount(service: DepositService): number {
  if (service.deposit_type === "fixed") return Math.round(service.deposit_value * 100) / 100;
  if (service.deposit_type === "percentage") return Math.round(service.price * (service.deposit_value / 100) * 100) / 100;
  return 0;
}

/**
 * No-show protection (spec-driven idea, not in the original build): when a
 * service has a deposit configured, auto-create and WhatsApp-send a
 * dedicated deposit invoice at booking time, reusing the exact same
 * invoice/payment/PDF machinery a normal invoice uses rather than inventing
 * a parallel payment path. Called from every booking-creation route (app
 * API, WhatsApp bot, public widget) — best-effort: a failure here should
 * never block the booking itself, callers should catch and ignore.
 */
export async function createAndSendDepositInvoice(
  env: Env,
  tenantId: string,
  params: { bookingId: string; customerId: string; service: DepositService }
): Promise<{ ok: boolean; invoiceId?: string; amount?: number }> {
  const amount = depositAmount(params.service);
  if (amount <= 0) return { ok: false };

  const db = createDb(env.DB);
  const [tenant] = await db.select({ vat_rate: schema.tenants.vat_rate, slug: schema.tenants.slug }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!tenant) return { ok: false };

  const { subtotal, vat_amount, total } = calculateInvoiceTotals([{ quantity: 1, unit_price: amount }], tenant.vat_rate);
  const existingCount = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.tenant_id, tenantId));
  const invoiceNumber = nextInvoiceNumber(existingCount.length + 1, tenant.slug);
  const invoiceId = crypto.randomUUID();

  await db.insert(schema.invoices).values({
    id: invoiceId,
    tenant_id: tenantId,
    booking_id: params.bookingId,
    customer_id: params.customerId,
    invoice_number: invoiceNumber,
    kind: "deposit",
    status: "draft",
    subtotal,
    vat_amount,
    total,
    currency: "AED",
  });
  await db.insert(schema.invoiceLineItems).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    invoice_id: invoiceId,
    kind: "labor",
    description: `Booking deposit — ${params.service.name}`,
    quantity: 1,
    unit_price: amount,
    total: amount,
  });

  await sendInvoiceViaWhatsApp(env, tenantId, invoiceId).catch(() => {});
  return { ok: true, invoiceId, amount: total };
}
