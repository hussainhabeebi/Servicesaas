import { useEffect, useState } from "react";
import { api, type Booking, type Staff } from "../api";
import { pageTitle, table, th, td, Badge, STATUS_COLORS, btn } from "../ui";

const NEXT_STATUS: Record<Booking["status"], Booking["status"] | null> = {
  scheduled: "en_route",
  en_route: "in_progress",
  in_progress: "completed",
  completed: null,
  cancelled: null,
};

function AssignStaffPicker({ booking, onAssigned }: { booking: Booking; onAssigned: () => void }) {
  const [options, setOptions] = useState<Array<{ id: string; name: string; color: string }> | null>(null);
  const [assigning, setAssigning] = useState(false);

  async function open() {
    const r = await api.availableStaff({ area: booking.area ?? undefined, start: booking.scheduled_start, end: booking.scheduled_end });
    setOptions(r.staff);
  }

  async function assign(staffId: string) {
    setAssigning(true);
    try {
      await api.assignStaff(booking.id, staffId);
      onAssigned();
    } finally {
      setAssigning(false);
    }
  }

  if (options === null) {
    return (
      <button style={{ ...btn, fontSize: "0.72rem", padding: "0.25rem 0.5rem" }} onClick={open}>
        Assign staff
      </button>
    );
  }

  if (options.length === 0) {
    return <span style={{ fontSize: "0.75rem", color: "#b91c1c" }}>No one free in this area/time</span>;
  }

  return (
    <select
      disabled={assigning}
      defaultValue=""
      onChange={(e) => e.target.value && assign(e.target.value)}
      style={{ fontSize: "0.78rem", padding: "0.25rem 0.4rem", borderRadius: 6, border: "1px solid #d1d5db" }}
    >
      <option value="" disabled>
        Pick staff…
      </option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.bookings().then((r) => setBookings(r.bookings)).catch((e) => setError(String(e)));
    api.staff().then((r) => setStaff(r.staff)).catch(() => {});
  };
  useEffect(() => { void load(); }, []);

  async function advance(b: Booking) {
    const next = NEXT_STATUS[b.status];
    if (!next) return;
    await api.updateBookingStatus(b.id, next);
    load();
  }

  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.name;

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Bookings</h1>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Date &amp; time</th>
            <th style={th}>Area</th>
            <th style={th}>Staff</th>
            <th style={th}>Status</th>
            <th style={th}>Source</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {bookings
            .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
            .map((b) => (
              <tr key={b.id}>
                <td style={td}>{new Date(b.scheduled_start).toLocaleString()}</td>
                <td style={td}>{b.area ?? "—"}</td>
                <td style={td}>
                  {b.staff_id ? staffName(b.staff_id) ?? "—" : <AssignStaffPicker booking={b} onAssigned={load} />}
                </td>
                <td style={td}>
                  <Badge color={STATUS_COLORS[b.status] ?? "#6b7280"}>{b.status}</Badge>
                </td>
                <td style={td}>{b.source}</td>
                <td style={td}>
                  {NEXT_STATUS[b.status] && (
                    <button style={btn} onClick={() => advance(b)}>
                      Mark {NEXT_STATUS[b.status]?.replace("_", " ")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {bookings.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No bookings yet.</p>}
    </div>
  );
}
