import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../types/env";
import { verifyAccessToken, verifyAdminAccessToken } from "./jwt";
import { createDb, schema } from "../db/client";

/**
 * Verifies the bearer JWT and cross-checks its tenant_id against the
 * request's already-resolved tenantId (from tenantResolutionMiddleware),
 * so a token issued for one tenant can never act on another tenant's data.
 */
export function requireAuth(...allowedRoles: Array<"owner" | "staff" | "admin">): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const authHeader = c.req.header("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return c.json({ error: "Missing bearer token" }, 401);

    const claims = await verifyAccessToken(token, c.env.JWT_SECRET);
    if (!claims) return c.json({ error: "Invalid or expired token" }, 401);

    const expectedTenantId = c.get("tenantId");
    if (expectedTenantId && claims.tenant_id !== expectedTenantId) {
      return c.json({ error: "Token does not match this tenant" }, 403);
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(claims.role)) {
      return c.json({ error: "Insufficient role" }, 403);
    }

    c.set("tenantId", claims.tenant_id);
    c.set("tenantUserId", claims.sub);
    c.set("tenantRole", claims.role);
    await next();
  };
}

/**
 * Verifies a platform admin JWT (routes/admin-auth.ts) — distinct token
 * shape from tenant AccessTokenClaims (see jwt.ts), so a tenant login can
 * never reach these routes. Also re-checks admin_users.active on every
 * request (not just at login) so deactivating an admin takes effect
 * immediately instead of waiting for their token to expire.
 */
export function requireAdminAuth(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const authHeader = c.req.header("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return c.json({ error: "Missing bearer token" }, 401);

    const claims = await verifyAdminAccessToken(token, c.env.JWT_SECRET);
    if (!claims) return c.json({ error: "Invalid or expired token" }, 401);

    const db = createDb(c.env.DB);
    const [admin] = await db.select({ active: schema.adminUsers.active }).from(schema.adminUsers).where(eq(schema.adminUsers.id, claims.sub)).limit(1);
    if (!admin || !admin.active) return c.json({ error: "Admin account is not active" }, 403);

    c.set("adminUserId", claims.sub);
    await next();
  };
}
