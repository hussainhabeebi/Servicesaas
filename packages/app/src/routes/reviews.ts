import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema, sendWhatsAppMessage } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/** Auto review-request message post-completion with a direct Google review link (spec §5/§10). */
export const reviewsRoute = new Hono<AppContext>();

const requestSchema = z.object({
  booking_id: z.string(),
  customer_id: z.string(),
  google_review_url: z.string().url(),
});

reviewsRoute.post("/request", async (c) => {
  const parsed = requestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, parsed.data.customer_id), eq(schema.customers.tenant_id, tenantId))).limit(1);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  const [waMapping] = await db.select({ phone_number_id: schema.waPhoneMapping.phone_number_id }).from(schema.waPhoneMapping).where(eq(schema.waPhoneMapping.tenant_id, tenantId)).limit(1);

  const id = crypto.randomUUID();
  await db.insert(schema.reviews).values({
    id,
    tenant_id: tenantId,
    booking_id: parsed.data.booking_id,
    customer_id: parsed.data.customer_id,
    requested_at: new Date().toISOString(),
  });

  let sent = false;
  if (waMapping) {
    const result = await sendWhatsAppMessage(c.env.WA_ACCESS_TOKEN, waMapping.phone_number_id, {
      to: customer.phone,
      body: `Hi ${customer.name}, thanks for choosing us! Mind leaving a quick review? ${parsed.data.google_review_url}`,
    });
    sent = result.ok;
  }

  return c.json({ id, sent }, 201);
});

const submitSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().optional() });

reviewsRoute.patch("/:id/submit", async (c) => {
  const parsed = submitSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  await db
    .update(schema.reviews)
    .set({ ...parsed.data, submitted_at: new Date().toISOString() })
    .where(and(eq(schema.reviews.id, c.req.param("id")), eq(schema.reviews.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

reviewsRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.reviews).where(eq(schema.reviews.tenant_id, c.get("tenantId")));
  return c.json({ reviews: rows });
});
