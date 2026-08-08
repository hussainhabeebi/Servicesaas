import { useEffect, useState } from "react";
import { api, type Customer } from "../api";
import { pageTitle, table, th, td, Badge } from "../ui";

/** Existing customers only — people who've actually booked (customers table). Leads live on their own page, never mixed in here. */
export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.customers().then((r) => setCustomers(r.customers)).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Customers</h1>
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
                    <Badge color="#4F46E5">{t}</Badge>
                  </span>
                ))}
              </td>
              <td style={td}>{c.is_repeat_customer ? "Yes" : "—"}</td>
              <td style={td}>{c.has_active_contract ? "Active" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {customers.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No customers yet — they'll appear here once a lead books.</p>}
    </div>
  );
}
