import type { AppContext } from "@serviceos/platform";
import { bookingCalendarId } from "../durable-objects/booking-calendar";

/** Shared by the bookings API route and the WhatsApp bot flow so both go through the same DO-backed lock. */
export async function reserveSlot(
  env: AppContext["Bindings"],
  tenantId: string,
  staffId: string | undefined,
  bookingId: string,
  start: string,
  end: string
): Promise<{ ok: boolean; conflictBookingId?: string }> {
  if (!staffId) return { ok: true };
  const doId = bookingCalendarId(env.BOOKING_CALENDAR, tenantId, staffId);
  const stub = env.BOOKING_CALENDAR.get(doId);
  const res = await stub.fetch("https://do/reserve", {
    method: "POST",
    body: JSON.stringify({ bookingId, start, end }),
  });
  return (await res.json()) as { ok: boolean; conflictBookingId?: string };
}
