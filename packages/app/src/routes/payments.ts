import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { getGateway } from "../lib/payment-gateways";

/** Authenticated: tenant staff generate a payment link for an invoice. Callback handling lives in payments-webhook.ts (unauthenticated by design). */
export const paymentsRoute = new Hono<AppContext>();

const createLinkSchema = z.object({
  invoice_id: z.string(),
  gateway: z.enum(["razorpay", "phonepe", "telr", "network_international"]),
  redirect_url: z.string().optional(),
});

paymentsRoute.post("/link", async (c) => {
  const parsed = createLinkSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.id, parsed.data.invoice_id), eq(schema.invoices.tenant_id, tenantId)))
    .limit(1);
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);
  const [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, invoice.customer_id)).limit(1);

  const gateway = getGateway(c.env, parsed.data.gateway);
  if (!gateway) return c.json({ error: `${parsed.data.gateway} is not configured for this environment` }, 400);

  const result = await gateway.createPaymentLink({
    amount: invoice.total - invoice.amount_paid,
    currency: invoice.currency,
    reference: invoice.invoice_number,
    description: `Invoice ${invoice.invoice_number}`,
    customerName: customer?.name,
    customerPhone: customer?.phone,
    customerEmail: customer?.email ?? undefined,
    redirectUrl: parsed.data.redirect_url,
  });
  if (!result.ok) return c.json({ error: result.error ?? "Gateway error" }, 502);

  await db.insert(schema.payments).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    invoice_id: invoice.id,
    method: "payment_link",
    gateway: parsed.data.gateway,
    gateway_ref: result.gatewayRef,
    amount: invoice.total - invoice.amount_paid,
    status: "pending",
  });

  return c.json({ paymentUrl: result.paymentUrl, gatewayRef: result.gatewayRef });
});
