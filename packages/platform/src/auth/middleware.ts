import type { MiddlewareHandler } from "hono";
import type { AppContext } from "../types/env";
import { verifyAccessToken } from "./jwt";

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
