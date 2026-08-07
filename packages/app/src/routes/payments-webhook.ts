import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { getGateway } from "../lib/payment-gateways";

/** Gateway callbacks land here unauthenticated by tenant — the tenant is inferred from the payment's gateway_ref -> invoice -> tenant chain. Each gateway's own signature scheme is the actual auth. */
export const paymentsWebhookRoute = new Hono<AppContext>();

paymentsWebhookRoute.post("/:gateway", async (c) => {
  const gatewayName = c.req.param("gateway");
  const rawBody = await c.req.text();
  const headers = Object.fromEntries(c.req.raw.headers.entries());
  const gateway = getGateway(c.env, gatewayName);
  if (!gateway) return c.json({ error: "Unknown gateway" }, 404);

  const valid = await gateway.verifyCallback(rawBody, headers);
  if (!valid) return c.json({ error: "Invalid signature" }, 401);

  const payload = JSON.parse(rawBody) as { reference_id?: string; order_id?: string; status?: string };
  const reference = payload.reference_id ?? payload.order_id;
  if (!reference) return c.json({ error: "No reference in payload" }, 400);

  const db = createDb(c.env.DB);
  const [invoice] = await db.select().from(schema.invoices).where(eq(schema.invoices.invoice_number, reference)).limit(1);
  if (!invoice) return c.json({ error: "Invoice not found for reference" }, 404);

  await db
    .update(schema.payments)
    .set({ status: "success", paid_at: new Date().toISOString() })
    .where(and(eq(schema.payments.invoice_id, invoice.id), eq(schema.payments.gateway, gatewayName as "razorpay" | "phonepe" | "telr" | "network_international")));

  await db
    .update(schema.invoices)
    .set({ status: "paid", amount_paid: invoice.total, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .where(eq(schema.invoices.id, invoice.id));

  return c.json({ ok: true });
});
