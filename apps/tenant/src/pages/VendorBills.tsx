import { useEffect, useState } from "react";
import { api, type VendorBill } from "../api";
import { pageTitle, table, th, td, Badge, STATUS_COLORS, btn, btnPrimary, input, card } from "../ui";

export function VendorBillsPage() {
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const load = () => api.vendorBills().then((r) => setBills(r.vendorBills)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api.createVendorBill({ vendor_name: vendorName, amount: Number(amount), due_date: dueDate || undefined });
    setVendorName("");
    setAmount("");
    setDueDate("");
    load();
  }

  async function pay(id: string) {
    await api.payVendorBill(id);
    load();
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Vendor Bills</h1>
      <form onSubmit={create} style={{ ...card, display: "flex", gap: "0.6rem", alignItems: "end", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Vendor</label>
          <input style={input} value={vendorName} onChange={(e) => setVendorName(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Amount (AED)</label>
          <input style={input} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Due date</label>
          <input style={input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <button type="submit" style={btnPrimary}>
          Add bill
        </button>
      </form>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Vendor</th>
            <th style={th}>Amount</th>
            <th style={th}>Due</th>
            <th style={th}>Status</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => (
            <tr key={b.id}>
              <td style={td}>{b.vendor_name}</td>
              <td style={td}>AED {b.amount.toFixed(2)}</td>
              <td style={td}>{b.due_date ? new Date(b.due_date).toLocaleDateString() : "—"}</td>
              <td style={td}>
                <Badge color={STATUS_COLORS[b.status] ?? "#6b7280"}>{b.status}</Badge>
              </td>
              <td style={td}>
                {b.status === "unpaid" && (
                  <button style={btn} onClick={() => pay(b.id)}>
                    Mark paid
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
