/**
 * One BookingCalendarDO instance per (tenant_id, staff_id) pair — see
 * bookingCalendarId() below. D1 is the system of record for bookings, but
 * D1 reads/writes from concurrent Worker invocations aren't serialized, so
 * two customers booking the same slot at the same instant could both pass
 * a "read existing bookings, check overlap" check against D1. Routing every
 * reserve/release through this DO gives each staff member's calendar a
 * single-threaded point of truth for slot locking; the Worker route still
 * does the actual D1 insert after the DO confirms the slot is free.
 */

interface ReservedSlot {
  bookingId: string;
  start: string; // ISO
  end: string; // ISO
}

interface ReserveRequest {
  bookingId: string;
  start: string;
  end: string;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export class BookingCalendarDO {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const slots = (await this.state.storage.get<Record<string, ReservedSlot>>("slots")) ?? {};

    if (url.pathname === "/reserve" && request.method === "POST") {
      const body = (await request.json()) as ReserveRequest;
      const conflict = Object.values(slots).find((s) => overlaps(s.start, s.end, body.start, body.end));
      if (conflict) {
        return Response.json({ ok: false, conflictBookingId: conflict.bookingId }, { status: 409 });
      }
      slots[body.bookingId] = { bookingId: body.bookingId, start: body.start, end: body.end };
      await this.state.storage.put("slots", slots);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/release" && request.method === "POST") {
      const body = (await request.json()) as { bookingId: string };
      delete slots[body.bookingId];
      await this.state.storage.put("slots", slots);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/reschedule" && request.method === "POST") {
      const body = (await request.json()) as ReserveRequest;
      const conflict = Object.values(slots).find(
        (s) => s.bookingId !== body.bookingId && overlaps(s.start, s.end, body.start, body.end)
      );
      if (conflict) {
        return Response.json({ ok: false, conflictBookingId: conflict.bookingId }, { status: 409 });
      }
      slots[body.bookingId] = { bookingId: body.bookingId, start: body.start, end: body.end };
      await this.state.storage.put("slots", slots);
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }
}

export function bookingCalendarId(namespace: DurableObjectNamespace, tenantId: string, staffId: string) {
  return namespace.idFromName(`${tenantId}:${staffId}`);
}
