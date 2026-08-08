import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDb, schema, verifyPassword, signAdminAccessToken } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { isLocked, nextLockoutState, clearedLockoutState, LOCKOUT_MINUTES } from "../lib/lockout";

/** Public (not gated by the static bootstrap token) — real per-admin password login, replacing the old shared-token model. */
export const adminAuthRoute = new Hono<AppContext>();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

adminAuthRoute.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { email, password } = parsed.data;
  const db = createDb(c.env.DB);

  const [admin] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.email, email)).limit(1);
  if (!admin || !admin.active) return c.json({ error: "Invalid credentials" }, 401);
  if (isLocked(admin.locked_until)) {
    return c.json({ error: "Too many failed attempts — try again in a few minutes" }, 429);
  }

  const valid = await verifyPassword(password, admin.password_hash);
  if (!valid) {
    const next = nextLockoutState(admin.failed_login_attempts);
    await db.update(schema.adminUsers).set(next).where(eq(schema.adminUsers.id, admin.id));
    if (next.locked_until) return c.json({ error: `Too many failed attempts — locked for ${LOCKOUT_MINUTES} minutes` }, 429);
    return c.json({ error: "Invalid credentials" }, 401);
  }

  await db
    .update(schema.adminUsers)
    .set({ ...clearedLockoutState, last_login_at: new Date().toISOString() })
    .where(eq(schema.adminUsers.id, admin.id));

  const token = await signAdminAccessToken(admin.id, c.env.JWT_SECRET);
  return c.json({ accessToken: token, admin: { id: admin.id, name: admin.name, email: admin.email } });
});
