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

/** Flags a booking that couldn't be auto-assigned a staff member (no coverage for the area/slot) so a human picks one manually. */
export async function createStaffAssignmentTask(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  bookingId: string,
  area: string | null | undefined,
  scheduledStart: string
) {
  await db.insert(schema.tasks).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    booking_id: bookingId,
    title: area ? `Assign staff for ${area} job on ${new Date(scheduledStart).toLocaleDateString()}` : "Assign staff for new booking",
    description: "No crew member covers this area/time automatically — pick one manually.",
    type: "staff_assignment",
    due_at: scheduledStart,
  });
}
