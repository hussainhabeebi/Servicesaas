import { createDb, schema } from "@serviceos/platform";

/** Auto-creates a job-day reminder task 1 day before a booking — called from every booking-creation path (API, WhatsApp bot, public widget). */
export async function createJobReminderTask(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  bookingId: string,
  staffId: string | undefined,
  scheduledStart: string
) {
  const dueAt = new Date(new Date(scheduledStart).getTime() - 24 * 3_600_000).toISOString();
  await db.insert(schema.tasks).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    booking_id: bookingId,
    assigned_staff_id: staffId,
    title: "Job tomorrow — confirm and prep",
    type: "job_reminder",
    due_at: dueAt,
  });
}
