export interface LineItemInput {
  quantity: number;
  unit_price: number;
}

/** UAE VAT is 5% on the subtotal; tenants in other jurisdictions can carry a different tenants.vat_rate. */
export function calculateInvoiceTotals(lineItems: LineItemInput[], vatRate: number) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const vat_amount = Math.round(subtotal * vatRate * 100) / 100;
  const total = Math.round((subtotal + vat_amount) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, vat_amount, total };
}

export function nextInvoiceNumber(sequence: number, tenantSlug: string): string {
  const year = new Date().getFullYear();
  return `${tenantSlug.slice(0, 4).toUpperCase()}-${year}-${String(sequence).padStart(4, "0")}`;
}
