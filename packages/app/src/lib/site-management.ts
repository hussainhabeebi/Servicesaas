import { and, desc, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";

/**
 * Website content management (spec §8) — extracted from routes/sites.ts so
 * both the tenant's own dashboard (self-serve) and the admin panel (support
 * override) call the exact same logic, just with a different source for
 * tenantId (JWT vs a route param).
 */

export interface SiteContentInput {
  businessName?: string;
  heroText?: string;
  hours?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  gallery?: string[];
  testimonials?: Array<{ name: string; quote: string }>;
  languages?: Array<"en" | "ar">;
}

export async function getSite(db: ReturnType<typeof createDb>, tenantId: string) {
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.tenant_id, tenantId)).limit(1);
  return site ?? null;
}

export async function updateSite(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  input: { content?: SiteContentInput; template_key?: string; sections_enabled?: string[] }
) {
  const site = await getSite(db, tenantId);
  if (!site) return null;

  const mergedContent = { ...(site.draft_content as object), ...(input.content ?? {}) };
  await db
    .update(schema.sites)
    .set({
      draft_content: mergedContent,
      template_key: input.template_key ?? site.template_key,
      sections_enabled: input.sections_enabled ?? site.sections_enabled,
      updated_at: new Date().toISOString(),
    })
    .where(eq(schema.sites.id, site.id));

  return mergedContent;
}

export async function publishSite(db: ReturnType<typeof createDb>, tenantId: string, publishedBy: string | undefined) {
  const site = await getSite(db, tenantId);
  if (!site) return null;

  await db.insert(schema.siteVersions).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    site_id: site.id,
    content: site.draft_content ?? {},
    published_by: publishedBy,
  });

  const publishedAt = new Date().toISOString();
  await db.update(schema.sites).set({ live_content: site.draft_content, published_at: publishedAt, updated_at: publishedAt }).where(eq(schema.sites.id, site.id));

  return publishedAt;
}

export async function listSiteVersions(db: ReturnType<typeof createDb>, tenantId: string) {
  return db.select().from(schema.siteVersions).where(eq(schema.siteVersions.tenant_id, tenantId)).orderBy(desc(schema.siteVersions.created_at));
}

export async function rollbackSiteVersion(db: ReturnType<typeof createDb>, tenantId: string, versionId: string): Promise<boolean> {
  const [version] = await db.select().from(schema.siteVersions).where(and(eq(schema.siteVersions.id, versionId), eq(schema.siteVersions.tenant_id, tenantId))).limit(1);
  if (!version) return false;

  await db
    .update(schema.sites)
    .set({ draft_content: version.content, live_content: version.content, updated_at: new Date().toISOString() })
    .where(eq(schema.sites.tenant_id, tenantId));
  return true;
}
