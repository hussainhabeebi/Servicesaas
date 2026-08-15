import { useEffect, useState } from "react";
import { api, type Booking, type FollowUpItem, type StaffingGap } from "../api";
import { card, pageTitle, table, th, td, Badge, Pill, STATUS_COLORS, colors } from "../ui";

const FOLLOWUP_STYLE: Record<FollowUpItem["type"], { label: string; bg: string; fg: string }> = {
  hot_lead: { label: "Hot lead", bg: colors.dangerSoft, fg: colors.danger },
  stalling_quote: { label: "Stalling quote", bg: colors.warnSoft, fg: colors.warn },
  rebook_due: { label: "Rebook due", bg: colors.accentSoft, fg: colors.accent },
};

function FollowUpRow({ item }: { item: FollowUpItem }) {
  const style = FOLLOWUP_STYLE[item.type];
  const waLink = `https://wa.me/${item.phone.replace(/\D/g, "")}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", padding: "0.75rem 0", borderBottom: `1px solid ${colors.border}` }}>
      <Pill bg={style.bg} fg={style.fg}>
        {style.label}
      </Pill>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{item.title}</div>
        <div style={{ fontSize: "0.8rem", color: colors.inkMuted }}>{item.subtitle}</div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
        <a href={`tel:${item.phone}`} style={{ ...miniBtn }}>
          📞
        </a>
        <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ ...miniBtn }}>
          💬
        </a>
      </div>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: `1px solid ${colors.border}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  fontSize: "0.9rem",
};

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "short", month: "short", day: "numeric" });

function StaffingGapRow({ gap }: { gap: StaffingGap }) {
  const hourLabel = new Date(`${gap.date}T${String(gap.hour).padStart(2, "0")}:00:00`).toLocaleTimeString([], { hour: "numeric" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", padding: "0.65rem 0", borderBottom: `1px solid ${colors.border}` }}>
      <Pill bg={colors.warnSoft} fg={colors.warn}>
        ⚠ Short-staffed
      </Pill>
      <div style={{ flex: 1, fontSize: "0.87rem" }}>
        <strong>{DAY_LABEL.format(new Date(`${gap.date}T12:00:00`))}</strong>, around {hourLabel} — {gap.bookedCount} jobs booked, only {gap.availableStaffCount} staff covering that hour.
      </div>
    </div>
  );
}

export function TodayPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [moneyIn, setMoneyIn] = useState(0);
  const [moneyOwed, setMoneyOwed] = useState(0);
  const [forecast, setForecast] = useState(0);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [staffingGaps, setStaffingGaps] = useState<StaffingGap[]>([]);
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
    api.suggestionsToday()
      .then((r) => {
        setFollowUps(r.followUps);
        setStaffingGaps(r.staffingGaps);
      })
      .catch(() => {});
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

      {followUps.length > 0 && (
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.25rem" }}>Follow up now</h2>
          <p style={{ fontSize: "0.82rem", color: colors.inkMuted, margin: "0 0 0.5rem" }}>Hot leads, stalling quotes, and customers due for a rebook — ranked so you know who to call first.</p>
          <div>
            {followUps.map((item) => (
              <FollowUpRow key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        </div>
      )}

      {staffingGaps.length > 0 && (
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.05rem", margin: "0 0 0.25rem" }}>Staffing gaps ahead</h2>
          <p style={{ fontSize: "0.82rem", color: colors.inkMuted, margin: "0 0 0.5rem" }}>More jobs booked than crew covering that hour, over the next 7 days.</p>
          <div>
            {staffingGaps.slice(0, 8).map((gap, i) => (
              <StaffingGapRow key={i} gap={gap} />
            ))}
          </div>
        </div>
      )}

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
