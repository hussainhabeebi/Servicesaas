import { useEffect, useState } from "react";
import { api, type AdminUser } from "../api";

export function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [newCred, setNewCred] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = () => api.listAdmins().then((r) => setAdmins(r.admins)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const result = await api.inviteAdmin(name, email);
    setNewCred({ email, tempPassword: result.tempPassword });
    setName("");
    setEmail("");
    load();
  }

  async function deactivate(id: string) {
    await api.deactivateAdmin(id);
    load();
  }

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <h2>Admin accounts</h2>
      <p style={{ color: "#6b7280", fontSize: "0.85rem" }}>Every ops person gets their own login — no shared token for day-to-day access.</p>

      <form onSubmit={invite} style={{ display: "flex", gap: "0.5rem", alignItems: "end", margin: "1rem 0" }}>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ padding: "0.5rem" }} />
        </div>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: "0.5rem" }} />
        </div>
        <button type="submit" style={{ padding: "0.5rem 1rem" }}>
          Invite admin
        </button>
      </form>

      {newCred && (
        <div style={{ background: "#eef2ff", padding: "0.9rem", borderRadius: 8, marginBottom: "1rem" }}>
          Share these login details with {newCred.email}: <strong>temp password: {newCred.tempPassword}</strong> — they should change it after first login.
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Email</th>
            <th style={th}>Last login</th>
            <th style={th}>Status</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.id}>
              <td style={td}>{a.name}</td>
              <td style={td}>{a.email}</td>
              <td style={td}>{a.last_login_at ? new Date(a.last_login_at).toLocaleString() : "never"}</td>
              <td style={td}>{a.active ? "active" : "deactivated"}</td>
              <td style={td}>
                {a.active && (
                  <button onClick={() => deactivate(a.id)} style={{ padding: "0.3rem 0.7rem" }}>
                    Deactivate
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

const th: React.CSSProperties = { textAlign: "left", padding: "0.5rem", borderBottom: "2px solid #e5e7eb", fontSize: "0.8rem", color: "#6b7280" };
const td: React.CSSProperties = { padding: "0.5rem", borderBottom: "1px solid #f3f4f6" };
