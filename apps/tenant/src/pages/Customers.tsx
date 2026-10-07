import { useEffect, useState } from "react";
import { api, type Customer } from "../api";
import { pageTitle, table, th, td, Badge } from "../ui";

const LOYALTY_MILESTONE = 5;

/** Existing customers only — people who've actually booked (customers table). Leads live on their own page, never mixed in here. */
export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ activationUrl: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function invitePortal(id: string) {
    setBusy(id);
    try { setInvite(await api.inviteCustomerPortal(id)); }
    catch (e) { setError(String(e)); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    api.customers().then((r) => setCustomers(r.customers)).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Customers</h1>
      {invite && <div style={{ padding: "1rem", background: "#edf6f7", borderRadius: 10, marginBottom: "1rem" }}>
        <strong>Customer portal invitation</strong>
        <p>Share this private, one-use link with the verified customer. It expires in 24 hours and can also reset their password.</p>
        <input readOnly aria-label="Customer activation link" value={invite.activationUrl} onFocus={e => e.currentTarget.select()} style={{ width: "100%", padding: "0.65rem", border: "1px solid #cbd5e1", borderRadius: 8 }} />
        <button onClick={async () => { try { await navigator.clipboard.writeText(invite.activationUrl); } catch { /* Input remains available for manual copying. */ } }} style={{ marginTop: "0.6rem" }}>Copy link</button>
      </div>}
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        People who've completed at least one booking with you. Prospects still deciding are on the <b>Leads</b> board.
      </p>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Phone</th>
            <th style={th}>Tags</th>
            <th style={th}>Repeat</th>
            <th style={th}>Contract</th>
            <th style={th}>Loyalty</th>
            <th style={th}>Website login</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td style={td}>{c.name}</td>
              <td style={td}>{c.phone}</td>
              <td style={td}>
                {c.tags?.map((t) => (
                  <span key={t} style={{ marginRight: 4 }}>
                    <Badge color="#036f71">{t}</Badge>
                  </span>
                ))}
              </td>
              <td style={td}>{c.is_repeat_customer ? "Yes" : "—"}</td>
              <td style={td}>{c.has_active_contract ? "Active" : "—"}</td>
              <td style={td}>
                {c.completed_bookings_count >= LOYALTY_MILESTONE ? (
                  <Badge color="#d2ad3a">🎁 {c.completed_bookings_count} completed</Badge>
                ) : (
                  <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{c.completed_bookings_count}/{LOYALTY_MILESTONE}</span>
                )}
              </td>
              <td style={td}><button disabled={busy === c.id} onClick={() => invitePortal(c.id)}>{busy === c.id ? "Creating…" : "Invite / reset login"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {customers.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No customers yet — they'll appear here once a lead books.</p>}
    </div>
  );
}
