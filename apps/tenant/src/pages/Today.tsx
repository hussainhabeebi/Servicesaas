import { useEffect, useState } from "react";
import { api, type Booking } from "../api";
import { card, pageTitle, table, th, td, Badge, STATUS_COLORS } from "../ui";

export function TodayPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [moneyIn, setMoneyIn] = useState(0);
  const [moneyOwed, setMoneyOwed] = useState(0);
  const [forecast, setForecast] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.today(), api.cashFlowForecast()])
      .then(([today, cf]) => {
        setBookings(today.todaysBookings);
        setMoneyIn(today.moneyComingInToday);
        setMoneyOwed(today.moneyOwedOverdue);
        setForecast(cf.moneyExpectedThisWeek);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Today</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        <div style={card}>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Money coming in today</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>AED {moneyIn.toFixed(2)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Money owed (overdue)</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: moneyOwed > 0 ? "#dc2626" : undefined }}>AED {moneyOwed.toFixed(2)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Expected this week</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>AED {forecast.toFixed(2)}</div>
        </div>
      </div>

      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Today's bookings</h2>
      {bookings.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Nothing scheduled today.</p>
      ) : (
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Time</th>
              <th style={th}>Status</th>
              <th style={th}>Source</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td style={td}>{new Date(b.scheduled_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                <td style={td}>
                  <Badge color={STATUS_COLORS[b.status] ?? "#6b7280"}>{b.status}</Badge>
                </td>
                <td style={td}>{b.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
