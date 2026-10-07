import { Hono } from "hono";
import { z } from "zod";
import { createDb, schema, DANFE_CONTENT, DANFE_SERVICES } from "@serviceos/platform";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "@serviceos/platform";
import { SITE_DESIGN_KEYS, getSite, updateSite, publishSite, listSiteVersions, rollbackSiteVersion } from "../lib/site-management";

/**
 * Website management module (spec §8): visual-editor-safe content fields
 * live in `sites.draft_content` until the tenant hits Publish, which
 * snapshots the outgoing draft into site_versions (for rollback) and
 * copies it into `live_content` — the one thing site-engine reads.
 */
export const sitesRoute = new Hono<AppContext>();

sitesRoute.post("/presets/danfe", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const [tenant] = await db.select({ business_name: schema.tenants.business_name, currency: schema.tenants.currency }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!tenant || !/danfe/i.test(tenant.business_name) || tenant.currency !== "AED") return c.json({ error: "This preset is for the Danfe business with AED pricing." }, 400);
  if (!(await getSite(db, tenantId))) return c.json({ error: "Website not found" }, 404);
  let servicesAdded = 0;
  for (const service of DANFE_SERVICES) {
    const [existing] = await db.select({ id: schema.services.id }).from(schema.services).where(and(eq(schema.services.tenant_id, tenantId), eq(schema.services.name, service.name))).limit(1);
    if (existing) await db.update(schema.services).set({ ...service, active: true, updated_at: new Date().toISOString() }).where(eq(schema.services.id, existing.id));
    else {
      await db.insert(schema.services).values({ id: `${tenantId}:danfe:${service.price}`, tenant_id: tenantId, active: true, ...service }).onConflictDoNothing();
      servicesAdded++;
    }
  }
  await updateSite(db, tenantId, { content: DANFE_CONTENT, sections_enabled: ["pricing", "gallery", "testimonials", "service_area_map"] });
  return c.json({ ok: true, servicesAdded });
});

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
  design: z.enum(SITE_DESIGN_KEYS).optional(),
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
