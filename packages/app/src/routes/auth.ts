import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDb, schema, verifyPassword, signAccessToken } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { isLocked, nextLockoutState, clearedLockoutState, LOCKOUT_MINUTES } from "../lib/lockout";

/**
 * Global login (not bound to a resolved tenant host) — an owner/staff
 * member may log in from the marketing site or api.servbazaar.com before
 * we know which tenant they belong to, so we look their account up by
 * email/phone directly.
 */
export const authRoute = new Hono<AppContext>();

const loginSchema = z.object({
  identifier: z.string().min(3), // email or phone
  password: z.string().min(1),
});

authRoute.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { identifier, password } = parsed.data;

  const db = createDb(c.env.DB);
  const byEmail = await db.select().from(schema.tenantUsers).where(eq(schema.tenantUsers.email, identifier)).limit(1);
  const byPhone = byEmail.length
    ? []
    : await db.select().from(schema.tenantUsers).where(eq(schema.tenantUsers.phone, identifier)).limit(1);
  const user = byEmail[0] ?? byPhone[0];

  if (!user || !user.active) return c.json({ error: "Invalid credentials" }, 401);
  if (isLocked(user.locked_until)) {
    return c.json({ error: `Too many failed attempts — try again in a few minutes`, lockedUntil: user.locked_until }, 429);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const next = nextLockoutState(user.failed_login_attempts);
    await db.update(schema.tenantUsers).set(next).where(eq(schema.tenantUsers.id, user.id));
    if (next.locked_until) return c.json({ error: `Too many failed attempts — locked for ${LOCKOUT_MINUTES} minutes` }, 429);
    return c.json({ error: "Invalid credentials" }, 401);
  }
  await db.update(schema.tenantUsers).set(clearedLockoutState).where(eq(schema.tenantUsers.id, user.id));

  const [tenant] = await db
    .select({ id: schema.tenants.id, status: schema.tenants.status, subdomain: schema.tenants.subdomain })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, user.tenant_id))
    .limit(1);
  if (!tenant || tenant.status !== "active") return c.json({ error: "Account is not active" }, 403);

  const token = await signAccessToken(
    { sub: user.id, tenant_id: user.tenant_id, role: user.role as "owner" | "staff" | "admin" },
    c.env.JWT_SECRET
  );

  return c.json({
    accessToken: token,
    user: { id: user.id, name: user.name, role: user.role },
    tenant: { id: tenant.id, subdomain: tenant.subdomain },
  });
});
