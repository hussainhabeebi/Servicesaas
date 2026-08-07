import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface InvoicePdfInput {
  tenantName: string;
  tenantAddress?: string | null;
  invoiceNumber: string;
  issuedDate: string;
  dueDate?: string | null;
  customerName: string;
  currency: string;
  lineItems: Array<{ description: string; quantity: number; unit_price: number; total: number }>;
  subtotal: number;
  vatAmount: number;
  vatRate: number;
  total: number;
}

/** Renders a simple, readable A4 invoice. Bytes go straight to R2 — no local disk. */
export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const left = 50;

  page.drawText(input.tenantName, { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 20;
  if (input.tenantAddress) {
    page.drawText(input.tenantAddress, { x: left, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
    y -= 25;
  }

  page.drawText(`Invoice ${input.invoiceNumber}`, { x: left, y, size: 14, font: bold });
  y -= 16;
  page.drawText(`Issued: ${input.issuedDate}`, { x: left, y, size: 10, font });
  if (input.dueDate) {
    page.drawText(`Due: ${input.dueDate}`, { x: left + 200, y, size: 10, font });
  }
  y -= 16;
  page.drawText(`Bill to: ${input.customerName}`, { x: left, y, size: 10, font });
  y -= 30;

  page.drawText("Description", { x: left, y, size: 10, font: bold });
  page.drawText("Qty", { x: left + 300, y, size: 10, font: bold });
  page.drawText("Unit", { x: left + 350, y, size: 10, font: bold });
  page.drawText("Total", { x: left + 430, y, size: 10, font: bold });
  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 16;

  for (const item of input.lineItems) {
    page.drawText(item.description, { x: left, y, size: 10, font, maxWidth: 240 });
    page.drawText(String(item.quantity), { x: left + 300, y, size: 10, font });
    page.drawText(item.unit_price.toFixed(2), { x: left + 350, y, size: 10, font });
    page.drawText(item.total.toFixed(2), { x: left + 430, y, size: 10, font });
    y -= 18;
  }

  y -= 10;
  page.drawLine({ start: { x: left + 300, y }, end: { x: 545, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 16;

  const row = (label: string, value: string, boldRow = false) => {
    page.drawText(label, { x: left + 350, y, size: 10, font: boldRow ? bold : font });
    page.drawText(value, { x: left + 460, y, size: 10, font: boldRow ? bold : font });
    y -= 16;
  };
  row("Subtotal", `${input.currency} ${input.subtotal.toFixed(2)}`);
  row(`VAT (${(input.vatRate * 100).toFixed(0)}%)`, `${input.currency} ${input.vatAmount.toFixed(2)}`);
  row("Total", `${input.currency} ${input.total.toFixed(2)}`, true);

  return doc.save();
}
