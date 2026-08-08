import { useEffect, useState } from "react";
import { api, type Invoice } from "../api";
import { pageTitle, table, th, td, Badge, STATUS_COLORS, btn } from "../ui";

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = () => api.invoices().then((r) => setInvoices(r.invoices)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function send(id: string) {
    setSendingId(id);
    try {
      await api.sendInvoice(id);
      load();
    } finally {
      setSendingId(null);
    }
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Quotes &amp; Invoices</h1>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Number</th>
            <th style={th}>Status</th>
            <th style={th}>Total</th>
            <th style={th}>Due</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td style={td}>{inv.invoice_number}</td>
              <td style={td}>
                <Badge color={STATUS_COLORS[inv.status] ?? "#6b7280"}>{inv.status}</Badge>
              </td>
              <td style={td}>
                {inv.currency} {inv.total.toFixed(2)} {inv.amount_paid > 0 && `(paid ${inv.amount_paid.toFixed(2)})`}
              </td>
              <td style={td}>{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</td>
              <td style={td}>
                {inv.status === "draft" && (
                  <button style={btn} disabled={sendingId === inv.id} onClick={() => send(inv.id)}>
                    {sendingId === inv.id ? "Sending…" : "Send via WhatsApp"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {invoices.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No invoices yet.</p>}
    </div>
  );
}
