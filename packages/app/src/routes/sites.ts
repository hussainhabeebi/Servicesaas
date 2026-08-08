import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { getSite, updateSite, publishSite, listSiteVersions, rollbackSiteVersion } from "../lib/site-management";

/**
 * Website management module (spec §8): visual-editor-safe content fields
 * live in `sites.draft_content` until the tenant hits Publish, which
 * snapshots the outgoing draft into site_versions (for rollback) and
 * copies it into `live_content` — the one thing site-engine reads.
 */
export const sitesRoute = new Hono<AppContext>();

const contentSchema = z.object({
  businessName: z.string().optional(),
  heroText: z.string().optional(),
  hours: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
  gallery: z.array(z.string()).optional(),
  testimonials: z.array(z.object({ name: z.string(), quote: z.string() })).optional(),
  languages: z.array(z.enum(["en", "ar"])).optional(),
});

const updateSchema = z.object({
  content: contentSchema.optional(),
  template_key: z.string().optional(),
  sections_enabled: z.array(z.string()).optional(),
});

sitesRoute.get("/", async (c) => {
  const site = await getSite(createDb(c.env.DB), c.get("tenantId"));
  if (!site) return c.json({ error: "Not found" }, 404);
  return c.json({ site });
});

sitesRoute.patch("/", async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const draftContent = await updateSite(createDb(c.env.DB), c.get("tenantId"), parsed.data);
  if (!draftContent) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, draftContent });
});

sitesRoute.post("/publish", async (c) => {
  const publishedAt = await publishSite(createDb(c.env.DB), c.get("tenantId"), c.get("tenantUserId"));
  if (!publishedAt) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true, publishedAt });
});

sitesRoute.get("/versions", async (c) => {
  const versions = await listSiteVersions(createDb(c.env.DB), c.get("tenantId"));
  return c.json({ versions });
});

sitesRoute.post("/versions/:id/rollback", async (c) => {
  const ok = await rollbackSiteVersion(createDb(c.env.DB), c.get("tenantId"), c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
