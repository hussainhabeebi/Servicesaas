import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb, schema, tenantResolutionMiddleware } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { renderSitePage, type SiteContent } from "./templates/registry";
import { renderSitemap, renderRobotsTxt } from "./seo";
import { renderLandingPage } from "./templates/landing";
import { renderPrivacyPolicy, renderTermsOfService } from "./templates/legal";

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

app.get("*", async (c) => {
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");

  const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  const [site] = await db.select().from(schema.sites).where(eq(schema.sites.tenant_id, tenantId)).limit(1);
  if (!tenant || !site) return c.text("Site not found", 404);

  const isPreview = c.req.query("preview") === "1";
  const content = ((isPreview ? site.draft_content : site.live_content ?? site.draft_content) ?? {}) as SiteContent;

  const services = await db
    .select({ id: schema.services.id, name: schema.services.name, price: schema.services.price, duration_minutes: schema.services.duration_minutes })
    .from(schema.services)
    .where(eq(schema.services.tenant_id, tenantId));

  const html = renderSitePage({
    templateKey: site.template_key,
    content,
    sectionsEnabled: site.sections_enabled ?? [],
    services,
    currency: tenant.currency,
    waLink: tenant.whatsapp_number ? `https://wa.me/${tenant.whatsapp_number.replace(/\D/g, "")}` : undefined,
    isDraftPreview: isPreview,
  });

  return c.html(html);
});

export default app;
