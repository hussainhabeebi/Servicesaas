import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { getFollowUpQueue, getStaffingGaps } from "../lib/suggestions";

/** Owner-dashboard "what should I do today" widget — see lib/suggestions.ts for the underlying rules. */
export const suggestionsRoute = new Hono<AppContext>();

suggestionsRoute.get("/today", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const [tenant] = await db.select({ timezone: schema.tenants.timezone }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);

  const [followUps, staffingGaps] = await Promise.all([
    getFollowUpQueue(db, tenantId),
    getStaffingGaps(db, tenantId, tenant?.timezone ?? "Asia/Dubai"),
  ]);

  return c.json({ followUps, staffingGaps });
});
