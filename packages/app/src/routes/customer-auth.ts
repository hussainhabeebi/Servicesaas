import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { and, eq, gt, sql } from "drizzle-orm";
import { createDb, schema, hashPassword, verifyPassword, signCustomerAccessToken, verifyCustomerAccessToken, type AppContext } from "@serviceos/platform";
import { isLocked, nextLockoutState, clearedLockoutState } from "../lib/lockout";

export async function invitationHash(token: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), b => b.toString(16).padStart(2, "0")).join("");
}

export const customerAuthRoute = new Hono<AppContext>();
customerAuthRoute.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });

customerAuthRoute.post("/activate", async (c) => {
  const parsed = z.object({ token: z.string().min(40).max(128), password: z.string().min(12).max(128) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Provide a valid invitation and a password of at least 12 characters." }, 400);
  const db = createDb(c.env.DB);
  const digest = await invitationHash(parsed.data.token);
  const conditions = and(eq(schema.customerAccounts.tenant_id, c.get("tenantId")), eq(schema.customerAccounts.invitation_hash, digest), gt(schema.customerAccounts.invitation_expires_at, new Date().toISOString()), eq(schema.customerAccounts.active, true));
  const [account] = await db.select().from(schema.customerAccounts).where(conditions).limit(1);
  if (!account) return c.json({ error: "Invitation expired or already used. Ask the business for a new link." }, 400);
  // Compare-and-consume in a single SQL update: concurrent activation cannot reuse the invitation.
  const rows = await db.update(schema.customerAccounts).set({ password_hash: await hashPassword(parsed.data.password), invitation_hash: null, invitation_expires_at: null, session_version: sql`${schema.customerAccounts.session_version} + 1`, ...clearedLockoutState, updated_at: new Date().toISOString() }).where(conditions).returning();
  if (!rows.length) return c.json({ error: "Invitation already used" }, 409);
  return c.json({ ok: true });
});

customerAuthRoute.post("/login", async (c) => {
  const parsed = z.object({ phone: z.string().min(6).max(40), password: z.string().min(1).max(128) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Phone and password required" }, 400);
  const db = createDb(c.env.DB);
  const [row] = await db.select({ account: schema.customerAccounts, customer: schema.customers }).from(schema.customerAccounts).innerJoin(schema.customers, and(eq(schema.customers.id, schema.customerAccounts.customer_id), eq(schema.customers.tenant_id, schema.customerAccounts.tenant_id))).where(and(eq(schema.customerAccounts.tenant_id, c.get("tenantId")), eq(schema.customers.phone, parsed.data.phone.trim()))).limit(1);
  if (!row?.account.active || !row.account.password_hash) return c.json({ error: "Invalid credentials" }, 401);
  if (isLocked(row.account.locked_until)) return c.json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  if (!(await verifyPassword(parsed.data.password, row.account.password_hash))) {
    const state = nextLockoutState(row.account.failed_login_attempts);
    await db.update(schema.customerAccounts).set(state).where(eq(schema.customerAccounts.id, row.account.id));
    return c.json({ error: "Invalid credentials" }, state.locked_until ? 429 : 401);
  }
  await db.update(schema.customerAccounts).set(clearedLockoutState).where(eq(schema.customerAccounts.id, row.account.id));
  const accessToken = await signCustomerAccessToken({ sub: row.account.id, customer_id: row.customer.id, tenant_id: c.get("tenantId"), version: row.account.session_version }, c.env.JWT_SECRET);
  return c.json({ accessToken, user: { name: row.customer.name, role: "customer" } });
});

export const requireCustomerAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  c.header("Cache-Control", "no-store");
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  const claims = await verifyCustomerAccessToken(token, c.env.JWT_SECRET);
  if (!claims || claims.tenant_id !== c.get("tenantId")) return c.json({ error: "Customer login required" }, 401);
  const db = createDb(c.env.DB);
  const [account] = await db.select().from(schema.customerAccounts).where(and(eq(schema.customerAccounts.id, claims.sub), eq(schema.customerAccounts.tenant_id, claims.tenant_id), eq(schema.customerAccounts.customer_id, claims.customer_id))).limit(1);
  if (!account?.active || !account.password_hash || account.session_version !== claims.version) return c.json({ error: "Please log in again" }, 401);
  c.set("customerId", claims.customer_id);
  c.set("customerAccountId", claims.sub);
  await next();
};
