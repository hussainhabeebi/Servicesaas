import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

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
  const db = createDb(c.env.DB);
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.tenant_id, c.get("tenantId"))).limit(1);
  if (!site) return c.json({ error: "Not found" }, 404);
  return c.json({ site });
});

sitesRoute.patch("/", async (c) => {
  const parsed = updateSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.tenant_id, tenantId)).limit(1);
  if (!site) return c.json({ error: "Not found" }, 404);

  const mergedContent = { ...(site.draft_content as object), ...(parsed.data.content ?? {}) };
  await db
    .update(schema.sites)
    .set({
      draft_content: mergedContent,
      template_key: parsed.data.template_key ?? site.template_key,
      sections_enabled: parsed.data.sections_enabled ?? site.sections_enabled,
      updated_at: new Date().toISOString(),
    })
    .where(eq(schema.sites.id, site.id));

  return c.json({ ok: true, draftContent: mergedContent });
});

sitesRoute.post("/publish", async (c) => {
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.tenant_id, tenantId)).limit(1);
  if (!site) return c.json({ error: "Not found" }, 404);

  await db.insert(schema.siteVersions).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    site_id: site.id,
    content: site.draft_content ?? {},
    published_by: c.get("tenantUserId"),
  });

  await db
    .update(schema.sites)
    .set({ live_content: site.draft_content, published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .where(eq(schema.sites.id, site.id));

  return c.json({ ok: true, publishedAt: new Date().toISOString() });
});

sitesRoute.get("/versions", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(schema.siteVersions)
    .where(eq(schema.siteVersions.tenant_id, c.get("tenantId")))
    .orderBy(desc(schema.siteVersions.created_at));
  return c.json({ versions: rows });
});

sitesRoute.post("/versions/:id/rollback", async (c) => {
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const [version] = await db.select().from(schema.siteVersions).where(and(eq(schema.siteVersions.id, c.req.param("id")), eq(schema.siteVersions.tenant_id, tenantId))).limit(1);
  if (!version) return c.json({ error: "Not found" }, 404);

  await db
    .update(schema.sites)
    .set({ draft_content: version.content, live_content: version.content, updated_at: new Date().toISOString() })
    .where(eq(schema.sites.tenant_id, tenantId));

  return c.json({ ok: true });
});
