import { useEffect, useState } from "react";
import { api, type Broadcast } from "../api";
import { pageTitle, table, th, td, Badge, STATUS_COLORS, btn, btnPrimary, input, card } from "../ui";

export function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Hi {{name}}, ");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const load = () => api.broadcasts().then((r) => setBroadcasts(r.broadcasts)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await api.createBroadcast({ name, message_template: message });
    setName("");
    setMessage("Hi {{name}}, ");
    load();
  }

  async function send(id: string) {
    setSendingId(id);
    try {
      const result = await api.sendBroadcast(id);
      alert(`Sent to ${result.sentCount} of ${result.audienceSize} customers`);
      load();
    } finally {
      setSendingId(null);
    }
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Broadcasts</h1>
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>Send a WhatsApp message to your customer list — e.g. a seasonal promo. Use {"{{name}}"} to personalize.</p>

      <form onSubmit={create} style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={{ marginBottom: "0.6rem" }}>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Campaign name</label>
          <input style={{ ...input, width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div style={{ marginBottom: "0.9rem" }}>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Message</label>
          <textarea style={{ ...input, width: "100%", minHeight: 80 }} value={message} onChange={(e) => setMessage(e.target.value)} required />
        </div>
        <button type="submit" style={btnPrimary}>
          Save as draft
        </button>
      </form>

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Status</th>
            <th style={th}>Sent</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {broadcasts.map((b) => (
            <tr key={b.id}>
              <td style={td}>{b.name}</td>
              <td style={td}>
                <Badge color={STATUS_COLORS[b.status] ?? "#6b7280"}>{b.status}</Badge>
              </td>
              <td style={td}>{b.sent_count}</td>
              <td style={td}>
                {b.status === "draft" && (
                  <button style={btn} disabled={sendingId === b.id} onClick={() => send(b.id)}>
                    {sendingId === b.id ? "Sending…" : "Send now"}
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
