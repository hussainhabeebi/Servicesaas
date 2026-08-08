import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema, hashPassword } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/** Team management (spec: "assign jobs/crews with their own logins, no shared passwords"). */
export const teamRoute = new Hono<AppContext>();

teamRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select({ id: schema.tenantUsers.id, name: schema.tenantUsers.name, email: schema.tenantUsers.email, phone: schema.tenantUsers.phone, role: schema.tenantUsers.role, staff_id: schema.tenantUsers.staff_id, active: schema.tenantUsers.active })
    .from(schema.tenantUsers)
    .where(eq(schema.tenantUsers.tenant_id, c.get("tenantId")));
  return c.json({ team: rows });
});

function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const inviteSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  createStaffRecord: z.boolean().default(true), // also creates the operational staff/crew record used for job assignment
});

teamRoute.post("/invite", async (c) => {
  const parsed = inviteSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  if (!input.email && !input.phone) return c.json({ error: "Provide at least an email or phone" }, 400);
  const db = createDb(c.env.DB);
  const tenantId = c.get("tenantId");

  let staffId: string | undefined;
  if (input.createStaffRecord) {
    staffId = crypto.randomUUID();
    await db.insert(schema.staff).values({ id: staffId, tenant_id: tenantId, name: input.name, phone: input.phone, email: input.email });
  }

  const tempPassword = generateTempPassword();
  const userId = crypto.randomUUID();
  await db.insert(schema.tenantUsers).values({
    id: userId,
    tenant_id: tenantId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    password_hash: await hashPassword(tempPassword),
    role: "staff",
    staff_id: staffId,
  });

  // No email/SMS delivery wired up for this — the caller (owner) shares the temp password directly.
  return c.json({ id: userId, staffId, tempPassword }, 201);
});

teamRoute.patch("/:id/deactivate", async (c) => {
  const db = createDb(c.env.DB);
  await db
    .update(schema.tenantUsers)
    .set({ active: false, updated_at: new Date().toISOString() })
    .where(and(eq(schema.tenantUsers.id, c.req.param("id")), eq(schema.tenantUsers.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

teamRoute.patch("/:id/reactivate", async (c) => {
  const db = createDb(c.env.DB);
  await db
    .update(schema.tenantUsers)
    .set({ active: true, updated_at: new Date().toISOString() })
    .where(and(eq(schema.tenantUsers.id, c.req.param("id")), eq(schema.tenantUsers.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
