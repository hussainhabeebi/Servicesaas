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
export function tenantResolutionMiddleware(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const host = (c.req.header("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
    const rootDomain = c.env.ROOT_DOMAIN.toLowerCase();
    const db = createDb(c.env.DB);

    let tenant: { id: string; status: string } | undefined;

    if (host.endsWith(`.${rootDomain}`)) {
      const subdomain = host;
      const [row] = await db
        .select({ id: schema.tenants.id, status: schema.tenants.status })
        .from(schema.tenants)
        .where(eq(schema.tenants.subdomain, subdomain))
        .limit(1);
      tenant = row;
    } else {
      const [row] = await db
        .select({ id: schema.tenants.id, status: schema.tenants.status })
        .from(schema.tenants)
        .innerJoin(schema.domains, eq(schema.domains.tenant_id, schema.tenants.id))
        .where(eq(schema.domains.domain, host))
        .limit(1);
      tenant = row;
    }

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
