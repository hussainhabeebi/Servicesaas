import { useEffect, useState } from "react";
import { api, type Service } from "../api";
import { pageTitle, table, th, td, Badge, btn, btnPrimary, input, card } from "../ui";

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");

  const load = () => api.services().then((r) => setServices(r.services)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function addService(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api.createService({ name, price: Number(price) || 0, duration_minutes: Number(duration) || 60 });
    setName("");
    setPrice("");
    setDuration("60");
    load();
  }

  async function updateDeposit(s: Service, deposit_type: Service["deposit_type"], deposit_value: number) {
    await api.updateService(s.id, { deposit_type, deposit_value });
    load();
  }

  async function remove(id: string) {
    await api.deleteService(id);
    load();
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Services</h1>
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Set a deposit on any service to reduce no-shows — a deposit invoice sends automatically over WhatsApp the moment a booking is made.
      </p>

      <form onSubmit={addService} style={{ ...card, display: "flex", gap: "0.6rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "end" }}>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Name</label>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Price (AED)</label>
          <input style={{ ...input, width: 110 }} type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Duration (mins)</label>
          <input style={{ ...input, width: 110 }} type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <button type="submit" style={btnPrimary}>
          Add service
        </button>
      </form>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Price</th>
            <th style={th}>Duration</th>
            <th style={th}>Deposit</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td style={td}>{s.name}</td>
              <td style={td}>AED {s.price.toFixed(0)}</td>
              <td style={td}>{s.duration_minutes} mins</td>
              <td style={td}>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  <select
                    value={s.deposit_type}
                    onChange={(e) => updateDeposit(s, e.target.value as Service["deposit_type"], s.deposit_value)}
                    style={{ fontSize: "0.8rem", padding: "0.3rem 0.4rem", borderRadius: 6, border: "1px solid #d1d5db" }}
                  >
                    <option value="none">No deposit</option>
                    <option value="fixed">Fixed AED</option>
                    <option value="percentage">% of price</option>
                  </select>
                  {s.deposit_type !== "none" && (
                    <input
                      type="number"
                      min="0"
                      defaultValue={s.deposit_value}
                      onBlur={(e) => updateDeposit(s, s.deposit_type, Number(e.target.value) || 0)}
                      style={{ width: 70, fontSize: "0.8rem", padding: "0.3rem 0.4rem", borderRadius: 6, border: "1px solid #d1d5db" }}
                    />
                  )}
                  {s.deposit_type !== "none" && <Badge color="#036f71">{s.deposit_type === "fixed" ? `AED ${s.deposit_value}` : `${s.deposit_value}%`}</Badge>}
                </div>
              </td>
              <td style={td}>
                <button style={btn} onClick={() => remove(s.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {services.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No services yet — add your first one above.</p>}
    </div>
  );
}
