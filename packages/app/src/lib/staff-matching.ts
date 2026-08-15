import { and, eq, gte, lte, ne } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";

/**
 * Location-based staff matching for on-site verticals (cleaning, repair,
 * pet care, etc.) — a booking's area/neighbourhood only matters once a
 * tenant has more than one crew member, so this stays a no-op (matches
 * everyone) for solo operators and for staff with no service_areas set.
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localDayAndTime(iso: string, timezone: string): { dayOfWeek: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return { dayOfWeek: WEEKDAYS.indexOf(weekday), hhmm: `${hour}:${minute}` };
}

export function coversArea(serviceAreas: string[] | null | undefined, area: string | null | undefined): boolean {
  if (!serviceAreas || serviceAreas.length === 0) return true; // no areas configured = covers everywhere
  if (!area) return false; // staff scoped to specific areas can't be matched to an unknown area
  const needle = area.trim().toLowerCase();
  if (!needle) return true;
  return serviceAreas.some((a) => {
    const hay = a.trim().toLowerCase();
    return hay === needle || needle.includes(hay) || hay.includes(needle);
  });
}

export interface StaffCandidate {
  id: string;
  name: string;
  color: string;
}

/**
 * Returns active staff who (a) cover `area`, (b) are within their working
 * hours for the slot (tenant's local timezone), and (c) have no overlapping
 * booking. Best-effort candidate list for auto-assign/UI suggestions — the
 * actual double-booking guard is still the per-staff BookingCalendarDO
 * (see booking-lock.ts), which every caller must still go through.
 */
export async function findAvailableStaff(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  params: { area?: string | null; start: string; end: string; timezone: string; excludeBookingId?: string }
): Promise<StaffCandidate[]> {
  const allStaff = await db
    .select({ id: schema.staff.id, name: schema.staff.name, color: schema.staff.color, service_areas: schema.staff.service_areas })
    .from(schema.staff)
    .where(and(eq(schema.staff.tenant_id, tenantId), eq(schema.staff.active, true)));
  if (allStaff.length === 0) return [];

  const areaMatched = allStaff.filter((s) => coversArea(s.service_areas, params.area));
  if (areaMatched.length === 0) return [];

  const { dayOfWeek, hhmm: startHHMM } = localDayAndTime(params.start, params.timezone);
  const { hhmm: endHHMM } = localDayAndTime(params.end, params.timezone);

  const availabilityRows = await db
    .select()
    .from(schema.staffAvailability)
    .where(and(eq(schema.staffAvailability.tenant_id, tenantId), eq(schema.staffAvailability.day_of_week, dayOfWeek)));

  const windowsByStaff = new Map<string, typeof availabilityRows>();
  for (const row of availabilityRows) {
    const list = windowsByStaff.get(row.staff_id) ?? [];
    list.push(row);
    windowsByStaff.set(row.staff_id, list);
  }

  // A slot that crosses local midnight (endHHMM < startHHMM) can't fit a
  // same-day working window — treat as unavailable rather than mismatching.
  const withinHours = areaMatched.filter((s) => {
    const windows = windowsByStaff.get(s.id);
    if (!windows || windows.length === 0) return true; // no availability rows configured = assume always available
    if (endHHMM < startHHMM) return false;
    return windows.some((w) => w.start_time <= startHHMM && endHHMM <= w.end_time);
  });
  if (withinHours.length === 0) return [];

  const candidateIds = new Set(withinHours.map((s) => s.id));
  const overlapping = await db
    .select({ id: schema.bookings.id, staff_id: schema.bookings.staff_id })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.tenant_id, tenantId),
        ne(schema.bookings.status, "cancelled"),
        lte(schema.bookings.scheduled_start, params.end),
        gte(schema.bookings.scheduled_end, params.start)
      )
    );

  const busyStaffIds = new Set(
    overlapping
      .filter((b) => b.staff_id && candidateIds.has(b.staff_id) && b.id !== params.excludeBookingId)
      .map((b) => b.staff_id as string)
  );

  return withinHours.filter((s) => !busyStaffIds.has(s.id)).map((s) => ({ id: s.id, name: s.name, color: s.color }));
}
