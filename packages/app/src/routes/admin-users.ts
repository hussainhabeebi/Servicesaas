import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { createAdminUser } from "../lib/admin-users";

/**
 * Admin account provisioning — mounted twice in index.ts: once at
 * /admin-bootstrap/users (gated by the static ADMIN_API_TOKEN, for creating
 * the very first admin account when none exist yet) and once at
 * /admin/users (gated by requireAdminAuth, so any already-logged-in admin
 * can invite colleagues without needing the bootstrap token every time).
 */
export const adminUsersRoute = new Hono<AppContext>();

adminUsersRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select({
      id: schema.adminUsers.id,
      name: schema.adminUsers.name,
      email: schema.adminUsers.email,
      active: schema.adminUsers.active,
      last_login_at: schema.adminUsers.last_login_at,
      created_at: schema.adminUsers.created_at,
    })
    .from(schema.adminUsers);
  return c.json({ admins: rows });
});

const createSchema = z.object({ name: z.string().min(2).max(120), email: z.string().email() });

adminUsersRoute.post("/", async (c) => {
  const parsed = createSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const existing = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.email, parsed.data.email)).limit(1);
  if (existing.length > 0) return c.json({ error: "An admin with this email already exists" }, 409);
  const result = await createAdminUser(db, parsed.data);
  return c.json(result, 201);
});

adminUsersRoute.patch("/:id/deactivate", async (c) => {
  const db = createDb(c.env.DB);
  await db.update(schema.adminUsers).set({ active: false, updated_at: new Date().toISOString() }).where(eq(schema.adminUsers.id, c.req.param("id")));
  return c.json({ ok: true });
});
