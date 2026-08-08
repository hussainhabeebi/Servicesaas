import { and, eq, sql } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";

/** Milestone every N completed bookings — just a badge in the Customers UI, no separate rewards ledger yet. */
export const LOYALTY_MILESTONE = 5;

/**
 * Increments a customer's completed-bookings counter the first time a
 * booking transitions into 'completed' — called from both status-transition
 * endpoints (POST /:id/status and POST /:id/checkout) in bookings.ts. Guards
 * against double-counting if a booking is marked completed more than once.
 */
export async function recordCompletionIfNew(db: ReturnType<typeof createDb>, tenantId: string, bookingId: string, newStatus: string) {
  if (newStatus !== "completed") return;
  const [booking] = await db
    .select({ status: schema.bookings.status, customer_id: schema.bookings.customer_id })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.tenant_id, tenantId)))
    .limit(1);
  if (!booking || booking.status === "completed") return;
  await db
    .update(schema.customers)
    .set({ completed_bookings_count: sql`${schema.customers.completed_bookings_count} + 1`, updated_at: new Date().toISOString() })
    .where(eq(schema.customers.id, booking.customer_id));
}
