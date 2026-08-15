import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import { calculateInvoiceTotals, nextInvoiceNumber } from "./vat";

/**
 * "Book service completions against customers, connect to billing": the
 * moment a booking is marked completed (owner UI or a staff member's own
 * job-completion action — see routes/bookings.ts), a draft invoice is
 * auto-created from the service's price so billing follows the job instead
 * of being a separate manual step the owner has to remember. Left as a
 * *draft* (not auto-sent, unlike deposit invoices in lib/deposits.ts) since
 * the owner may still want to add materials/adjustments before sending.
 * A no-op if an invoice already exists for this booking, so re-marking a
 * booking completed never creates duplicates.
 */
export async function ensureInvoiceForCompletedBooking(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  bookingId: string
): Promise<{ created: boolean; invoiceId?: string }> {
  const [existing] = await db
    .select({ id: schema.invoices.id })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.tenant_id, tenantId), eq(schema.invoices.booking_id, bookingId), eq(schema.invoices.kind, "standard")))
    .limit(1);
  if (existing) return { created: false };

  const [booking] = await db
    .select({ customerId: schema.bookings.customer_id, serviceId: schema.bookings.service_id })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)))
    .limit(1);
  if (!booking) return { created: false };

  const [service] = await db.select({ name: schema.services.name, price: schema.services.price }).from(schema.services).where(eq(schema.services.id, booking.serviceId)).limit(1);
  const [tenant] = await db.select({ vat_rate: schema.tenants.vat_rate, slug: schema.tenants.slug }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!service || !tenant) return { created: false };

  const lineItem = { kind: "labor" as const, description: service.name, quantity: 1, unit_price: service.price, total: service.price };
  const { subtotal, vat_amount, total } = calculateInvoiceTotals([lineItem], tenant.vat_rate);

  const existingCount = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.tenant_id, tenantId));
  const invoiceNumber = nextInvoiceNumber(existingCount.length + 1, tenant.slug);

  const invoiceId = crypto.randomUUID();
  await db.insert(schema.invoices).values({
    id: invoiceId,
    tenant_id: tenantId,
    booking_id: bookingId,
    customer_id: booking.customerId,
    invoice_number: invoiceNumber,
    kind: "standard",
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
    kind: lineItem.kind,
    description: lineItem.description,
    quantity: lineItem.quantity,
    unit_price: lineItem.unit_price,
    total: lineItem.total,
  });

  return { created: true, invoiceId };
}
