import { useEffect, useState } from "react";
import { api, type Booking } from "../api";
import { pageTitle, table, th, td, Badge, STATUS_COLORS, btn } from "../ui";

const NEXT_STATUS: Record<Booking["status"], Booking["status"] | null> = {
  scheduled: "en_route",
  en_route: "in_progress",
  in_progress: "completed",
  completed: null,
  cancelled: null,
};

export function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.bookings().then((r) => setBookings(r.bookings)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function advance(b: Booking) {
    const next = NEXT_STATUS[b.status];
    if (!next) return;
    await api.updateBookingStatus(b.id, next);
    load();
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Bookings</h1>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Date &amp; time</th>
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
