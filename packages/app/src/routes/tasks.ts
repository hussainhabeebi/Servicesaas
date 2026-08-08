import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/** Tasks & reminders (spec: "job-day reminders, follow-ups, nothing falls through the cracks"). */
export const tasksRoute = new Hono<AppContext>();

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["job_reminder", "follow_up", "general"]).default("general"),
  booking_id: z.string().optional(),
  assigned_staff_id: z.string().optional(),
  due_at: z.string().optional(),
});

tasksRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const { status } = c.req.query();
  const conditions = [eq(schema.tasks.tenant_id, c.get("tenantId"))];
  if (status) conditions.push(eq(schema.tasks.status, status));
  const rows = await db.select().from(schema.tasks).where(and(...conditions));
  return c.json({ tasks: rows });
});

tasksRoute.post("/", async (c) => {
  const parsed = taskSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(schema.tasks).values({ id, tenant_id: c.get("tenantId"), ...parsed.data });
  return c.json({ id }, 201);
});

tasksRoute.patch("/:id/done", async (c) => {
  const db = createDb(c.env.DB);
  await db
    .update(schema.tasks)
    .set({ status: "done" })
    .where(and(eq(schema.tasks.id, c.req.param("id")), eq(schema.tasks.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});

tasksRoute.delete("/:id", async (c) => {
  const db = createDb(c.env.DB);
  await db.delete(schema.tasks).where(and(eq(schema.tasks.id, c.req.param("id")), eq(schema.tasks.tenant_id, c.get("tenantId"))));
  return c.json({ ok: true });
});
