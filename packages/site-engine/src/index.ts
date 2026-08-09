import { Hono } from "hono";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { createDb, schema, tenantResolutionMiddleware } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { renderSitePage, getTheme, type SiteContent } from "./templates/registry";
import { renderSitemap, renderRobotsTxt, renderMarketingSitemap } from "./seo";
import { renderLandingPage } from "./templates/landing";
import { renderPrivacyPolicy, renderTermsOfService } from "./templates/legal";
import { renderManifest, SERVICE_WORKER_JS } from "./pwa";
import { OG_IMAGE_BASE64, SQUARE_LOGO_BASE64 } from "./assets/logo";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const app = new Hono<AppContext>();

// The bare apex domain (and www.) is the product's own marketing page, not
// a tenant — handled before tenant host resolution so it never hits the
// "unknown tenant host" path.
app.use("*", async (c, next) => {
  const host = (c.req.header("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (host !== c.env.ROOT_DOMAIN && host !== `www.${c.env.ROOT_DOMAIN}`) {
    return next();
  }
  const path = new URL(c.req.url).pathname;
  if (path === "/privacy") return c.html(renderPrivacyPolicy(c.env.ROOT_DOMAIN));
  if (path === "/terms") return c.html(renderTermsOfService(c.env.ROOT_DOMAIN));
  if (path === "/robots.txt") return c.text(renderRobotsTxt(c.env.ROOT_DOMAIN), 200, { "content-type": "text/plain" });
  if (path === "/sitemap.xml") return c.text(renderMarketingSitemap(c.env.ROOT_DOMAIN), 200, { "content-type": "application/xml" });
  if (path === "/og-image.jpg") return new Response(base64ToBytes(OG_IMAGE_BASE64), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400" } });
  if (path === "/logo.png") return new Response(base64ToBytes(SQUARE_LOGO_BASE64), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  return c.html(renderLandingPage(c.env.API_BASE_URL, c.env.ROOT_DOMAIN));
});

app.use("*", tenantResolutionMiddleware());

app.get("/robots.txt", (c) => c.text(renderRobotsTxt(c.req.header("host") ?? c.env.ROOT_DOMAIN), 200, { "content-type": "text/plain" }));

app.get("/sitemap.xml", async (c) => {
  const db = createDb(c.env.DB);
  const [site] = await db.select({ sections_enabled: schema.sites.sections_enabled }).from(schema.sites).where(eq(schema.sites.tenant_id, c.get("tenantId"))).limit(1);
  const xml = renderSitemap(c.req.header("host") ?? c.env.ROOT_DOMAIN, site?.sections_enabled ?? []);
  return c.text(xml, 200, { "content-type": "application/xml" });
});

/** Per-tenant PWA manifest — own name/icon/theme so each tenant's site installs as its own app, not a shared "ServBazaar" one. See pwa.ts. */
app.get("/manifest.webmanifest", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");
  const [tenant] = await db.select({ business_name: schema.tenants.business_name }).from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const [site] = await db.select({ template_key: schema.sites.template_key, draft_content: schema.sites.draft_content, live_content: schema.sites.live_content }).from(schema.sites).where(eq(schema.sites.tenant_id, tenantId)).limit(1);
  const content = (site?.live_content ?? site?.draft_content ?? {}) as SiteContent;
  const manifest = renderManifest({
    businessName: content.businessName ?? tenant?.business_name ?? "Our Business",
    themeColor: getTheme(site?.template_key ?? "generic").accent,
    logoUrl: content.logoUrl,
  });
  return c.json(manifest, 200, { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" });
});

app.get("/sw.js", (c) => c.text(SERVICE_WORKER_JS, 200, { "content-type": "application/javascript", "cache-control": "public, max-age=3600", "service-worker-allowed": "/" }));

app.get("/icon-192.png", (c) => new Response(base64ToBytes(SQUARE_LOGO_BASE64), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }));
app.get("/icon-512.png", (c) => new Response(base64ToBytes(SQUARE_LOGO_BASE64), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }));

app.get("*", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");

  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.tenant_id, tenantId)).limit(1);
  if (!tenant || !site) return c.text("Site not found", 404);

  const isPreview = c.req.query("preview") === "1";
  const content = ((isPreview ? site.draft_content : site.live_content ?? site.draft_content) ?? {}) as SiteContent;

  const services = await db
    .select({ id: schema.services.id, name: schema.services.name, category: schema.services.category, description: schema.services.description, price: schema.services.price, duration_minutes: schema.services.duration_minutes })
    .from(schema.services)
    .where(and(eq(schema.services.tenant_id, tenantId), eq(schema.services.active, true)));

  // Real, tenant-submitted reviews only — never fabricated, so AggregateRating
  // schema (registry.ts) stays honest. Newest first, capped so the page stays light.
  const reviews = await db
    .select({ rating: schema.reviews.rating, comment: schema.reviews.comment, customerName: schema.customers.name, submittedAt: schema.reviews.submitted_at })
    .from(schema.reviews)
    .leftJoin(schema.customers, eq(schema.reviews.customer_id, schema.customers.id))
    .where(and(eq(schema.reviews.tenant_id, tenantId), isNotNull(schema.reviews.submitted_at), isNotNull(schema.reviews.rating)))
    .orderBy(desc(schema.reviews.submitted_at))
    .limit(12);

  const host = c.req.header("host") ?? c.env.ROOT_DOMAIN;
  const html = renderSitePage({
    templateKey: site.template_key,
    content,
    sectionsEnabled: site.sections_enabled ?? [],
    services,
    reviews: reviews.map((r) => ({ rating: r.rating!, comment: r.comment, customerName: r.customerName })),
    currency: tenant.currency,
    waLink: tenant.whatsapp_number ? `https://wa.me/${tenant.whatsapp_number.replace(/\D/g, "")}` : undefined,
    isDraftPreview: isPreview,
    canonicalUrl: `https://${host}/`,
    phone: tenant.whatsapp_number ?? content.phone,
    apiBaseUrl: c.env.API_BASE_URL,
  });

  return c.html(html);
});

export default app;
