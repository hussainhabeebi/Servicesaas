import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/**
 * Google Calendar / Cal.com sync. Cal.com's v1 API just needs an API key
 * (no OAuth app registration), so that connect path genuinely stores a
 * working credential. Google Calendar needs a real Google Cloud OAuth
 * client (GOOGLE_CLIENT_ID/SECRET) this environment has no way to
 * provision — that path returns a clear "not configured" error instead
 * of faking a connection.
 *
 * Note: connecting a calendar here stores the credential but doesn't yet
 * auto-push new bookings to it — that wiring (call out to the provider
 * whenever a booking is created for a connected staff member) is the
 * next step, not built in this pass.
 */
export const calendarSyncRoute = new Hono<AppContext>();

calendarSyncRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.calendarConnections).where(eq(schema.calendarConnections.tenant_id, c.get("tenantId")));
  return c.json({ connections: rows.map((r) => ({ ...r, access_token: undefined, refresh_token: undefined })) });
});

const calComSchema = z.object({ staff_id: z.string(), api_key: z.string().min(10) });

calendarSyncRoute.post("/cal-com/connect", async (c) => {
  const parsed = calComSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");

  const verifyRes = await fetch(`https://api.cal.com/v1/me?apiKey=${encodeURIComponent(parsed.data.api_key)}`);
  if (!verifyRes.ok) return c.json({ error: "Cal.com rejected this API key" }, 400);

  const [existing] = await db
    .select({ id: schema.calendarConnections.id })
    .from(schema.calendarConnections)
    .where(and(eq(schema.calendarConnections.staff_id, parsed.data.staff_id), eq(schema.calendarConnections.provider, "cal_com")))
    .limit(1);

  if (existing) {
    await db.update(schema.calendarConnections).set({ access_token: parsed.data.api_key, connected_at: new Date().toISOString() }).where(eq(schema.calendarConnections.id, existing.id));
    return c.json({ ok: true, id: existing.id });
  }
  const id = crypto.randomUUID();
  await db.insert(schema.calendarConnections).values({ id, tenant_id: tenantId, staff_id: parsed.data.staff_id, provider: "cal_com", access_token: parsed.data.api_key, connected_at: new Date().toISOString() });
  return c.json({ ok: true, id }, 201);
});

calendarSyncRoute.post("/google/connect", (c) => {
  return c.json(
    { error: "Google Calendar sync needs a Google Cloud OAuth client (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET) that isn't configured for this environment yet." },
    501
  );
});

calendarSyncRoute.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  await db.delete(schema.calendarConnections).where(and(eq(schema.calendarConnections.id, c.req.param("id")), eq(schema.calendarConnections.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
