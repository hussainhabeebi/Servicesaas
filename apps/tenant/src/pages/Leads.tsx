import { useEffect, useState } from "react";
import { api, type Lead } from "../api";
import { card, pageTitle, Badge, MOOD_COLORS } from "../ui";

const COLUMNS: Array<{ status: Lead["status"]; label: string }> = [
  { status: "open", label: "Open" },
  { status: "quoted", label: "Quoted" },
  { status: "booked", label: "Booked" },
  { status: "closed", label: "Closed" },
];

/**
 * Leads are prospects who haven't converted yet (leads table) — kept
 * visually and structurally separate from Customers (customers table,
 * see Customers.tsx). A lead only becomes a customer once they actually
 * book; this board never shows converted customers.
 */
export function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.leads().then((r) => setLeads(r.leads)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function moveTo(lead: Lead, status: Lead["status"]) {
    await api.updateLead(lead.id, { status });
    load();
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Leads</h1>
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Enquiries that haven't booked yet. Once a lead books, they show up in <b>Customers</b> instead.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
        {COLUMNS.map((col) => (
          <div key={col.status}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.6rem", color: "#374151" }}>
              {col.label} ({leads.filter((l) => l.status === col.status).length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {leads
                .filter((l) => l.status === col.status)
                .map((lead) => (
                  <div key={lead.id} style={{ ...card, padding: "0.9rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <strong style={{ fontSize: "0.88rem" }}>{lead.customer_name ?? lead.phone}</strong>
                      <Badge color={MOOD_COLORS[lead.mood]}>{lead.mood}</Badge>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.3rem" }}>{lead.service_interest ?? "—"}</div>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>{lead.area ?? ""}</div>
                    <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                      {COLUMNS.filter((c) => c.status !== col.status).map((c) => (
                        <button
                          key={c.status}
                          onClick={() => moveTo(lead, c.status)}
                          style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer" }}
                        >
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
