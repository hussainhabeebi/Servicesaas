import { useEffect, useState } from "react";
import { api, type Booking, type Customer, type Service } from "../api";
import { pageTitle, Badge, STATUS_COLORS, colors } from "../ui";

/**
 * Staff-specific mobile flow: a crew member's own assigned jobs (server-scoped
 * to their staff_id, see GET /api/bookings/mine), with big-tap Check In /
 * Complete actions. Completing a job connects straight to billing — see
 * lib/billing-on-completion.ts — so there's no separate "now go create an
 * invoice" step for a technician in the field.
 */
export function MyJobsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.myJobs().then((r) => setBookings(r.bookings)).catch((e) => setError(String(e)));
    api.customers().then((r) => setCustomers(r.customers)).catch(() => {});
    api.services().then((r) => setServices(r.services)).catch(() => {});
  };
  useEffect(() => { void load(); }, []);

  const customerFor = (id: string) => customers.find((c) => c.id === id);
  const serviceFor = (id: string) => services.find((s) => s.id === id);

  async function checkIn(id: string) {
    setBusyId(id);
    setNote(null);
    try {
      await api.checkInJob(id);
      load();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function complete(id: string) {
    setBusyId(id);
    setNote(null);
    try {
      const result = await api.completeJob(id);
      setNote(result.invoiceId ? "Job marked complete — a draft invoice was created." : "Job marked complete.");
      load();
    } catch (e) {
      setNote(String(e));
    } finally {
      setBusyId(null);
    }
  }

  const upcoming = bookings
    .filter((b) => b.status !== "completed" && b.status !== "cancelled")
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));

  if (error) return <p style={{ color: colors.danger }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>My Jobs</h1>
      {note && (
        <div style={{ background: colors.accentSoft, color: colors.accent, borderRadius: 10, padding: "0.65rem 0.9rem", fontSize: "0.85rem", fontWeight: 600, marginBottom: "1rem" }}>
          {note}
        </div>
      )}
      {upcoming.length === 0 ? (
        <p style={{ color: colors.inkMuted }}>Nothing on your schedule right now.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {upcoming.map((b) => {
            const customer = customerFor(b.customer_id);
            const service = serviceFor(b.service_id);
            const busy = busyId === b.id;
            const canCheckIn = b.status === "scheduled" || b.status === "en_route";
            const canComplete = b.status === "in_progress";
            return (
              <div key={b.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 14, padding: "1.1rem 1.2rem", background: colors.surface }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1rem" }}>{service?.name ?? "Service"}</div>
                    <div style={{ fontSize: "0.85rem", color: colors.inkMuted }}>
                      {new Date(b.scheduled_start).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                  <Badge color={STATUS_COLORS[b.status] ?? "#6b7280"}>{b.status.replace("_", " ")}</Badge>
                </div>
                <div style={{ fontSize: "0.88rem", marginBottom: "0.3rem" }}>
                  <strong>{customer?.name ?? "Customer"}</strong>
                  {b.area ? ` — ${b.area}` : ""}
                </div>
                {customer?.phone && (
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.9rem" }}>
                    <a href={`tel:${customer.phone}`} style={contactBtn}>📞 Call</a>
                    <a href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={contactBtn}>💬 WhatsApp</a>
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.6rem" }}>
                  {canCheckIn && (
                    <button disabled={busy} onClick={() => checkIn(b.id)} style={{ ...actionBtn, background: colors.ink, color: "#fff" }}>
                      {busy ? "…" : "Check In"}
                    </button>
                  )}
                  {canComplete && (
                    <button disabled={busy} onClick={() => complete(b.id)} style={{ ...actionBtn, background: colors.accent, color: "#fff" }}>
                      {busy ? "…" : "Complete Job"}
                    </button>
                  )}
                  {!canCheckIn && !canComplete && <span style={{ fontSize: "0.8rem", color: colors.inkMuted, alignSelf: "center" }}>Waiting on the owner to assign/confirm.</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 10,
  padding: "0.75rem",
  fontWeight: 700,
  fontSize: "0.9rem",
  cursor: "pointer",
};

const contactBtn: React.CSSProperties = {
  flex: 1,
  textAlign: "center",
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: "0.5rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  textDecoration: "none",
  color: colors.ink,
};
