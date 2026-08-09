import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { createDb, schema } from "../db/client";
import type { AppContext } from "../types/env";

/**
 * Resolves tenant_id from the request Host header — either the tenant's
 * {slug}.{ROOT_DOMAIN} subdomain or a verified custom domain — and injects
 * it into context so every downstream query can scope on it. This is the
 * one place hostname -> tenant_id translation happens; nothing downstream
 * should re-derive it.
 */
async function resolveTenantByHost(db: ReturnType<typeof createDb>, host: string, rootDomain: string) {
  if (host.endsWith(`.${rootDomain}`)) {
    const [row] = await db
      .select({ id: schema.tenants.id, status: schema.tenants.status })
      .from(schema.tenants)
      .where(eq(schema.tenants.subdomain, host))
      .limit(1);
    return row;
  }
  const [row] = await db
    .select({ id: schema.tenants.id, status: schema.tenants.status })
    .from(schema.tenants)
    .innerJoin(schema.domains, eq(schema.domains.tenant_id, schema.tenants.id))
    .where(eq(schema.domains.domain, host))
    .limit(1);
  return row;
}

export function tenantResolutionMiddleware(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const host = (c.req.header("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
    const rootDomain = c.env.ROOT_DOMAIN.toLowerCase();
    const db = createDb(c.env.DB);

    const tenant = await resolveTenantByHost(db, host, rootDomain);

    if (!tenant) {
      return c.json({ error: "Unknown tenant host", host }, 404);
    }
    if (tenant.status !== "active") {
      return c.json({ error: "This business account is not currently active" }, 403);
    }

    c.set("tenantId", tenant.id);
    await next();
  };
}

/**
 * Tenant sites are served by site-engine on the tenant's own host
 * (subdomain or custom domain), but their booking-widget JS calls the API
 * worker, which lives on a different host entirely (api.{rootDomain}) — so
 * the real Host header on that request is always the API's own host, not
 * the storefront's. The widget instead sends the storefront host it's
 * running on via X-Site-Host, and resolution proceeds exactly like the
 * Host-based path above. This is no less trustworthy than Host itself:
 * these are unauthenticated, read/write-public storefront routes (no
 * session, no cross-tenant data exposure) where a caller could already send
 * any Host header directly, so trusting a second client-supplied hostname
 * header here doesn't weaken anything.
 */
export function publicSiteResolutionMiddleware(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const host = (c.req.header("x-site-host") ?? c.req.header("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
    const rootDomain = c.env.ROOT_DOMAIN.toLowerCase();
    const db = createDb(c.env.DB);

    const tenant = await resolveTenantByHost(db, host, rootDomain);

    if (!tenant) {
      return c.json({ error: "Unknown tenant host", host }, 404);
    }
    if (tenant.status !== "active") {
      return c.json({ error: "This business account is not currently active" }, 403);
    }

    c.set("tenantId", tenant.id);
    await next();
  };
}

/**
 * For platform-internal routes (onboarding, admin) that resolve tenant_id
 * explicitly rather than from the request host — e.g. via an authenticated
 * session that already carries tenant_id.
 */
export function requireTenantId(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    if (!c.get("tenantId")) {
      return c.json({ error: "Missing tenant context" }, 400);
    }
    await next();
  };
}
