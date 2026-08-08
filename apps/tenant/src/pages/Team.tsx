import { useEffect, useState } from "react";
import { api, type TeamMember } from "../api";
import { pageTitle, table, th, td, Badge, btn, btnPrimary, input, card } from "../ui";

export function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newCred, setNewCred] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = () => api.team().then((r) => setTeam(r.team)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const result = await api.inviteTeamMember({ name, email: email || undefined, phone: phone || undefined });
    setNewCred({ email: email || phone, tempPassword: result.tempPassword });
    setName("");
    setEmail("");
    setPhone("");
    load();
  }

  async function deactivate(id: string) {
    await api.deactivateTeamMember(id);
    load();
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Team</h1>
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>Each team member gets their own login — no shared passwords.</p>

      <form onSubmit={invite} style={{ ...card, display: "flex", gap: "0.6rem", alignItems: "end", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Name</label>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Email</label>
          <input style={input} value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div>
          <label style={{ fontSize: "0.78rem", display: "block", marginBottom: 3 }}>Phone</label>
          <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <button type="submit" style={btnPrimary}>
          Invite
        </button>
      </form>

      {newCred && (
        <div style={{ ...card, background: "#eef2ff", marginBottom: "1.5rem" }}>
          Share these login details with {newCred.email}: <strong>temp password: {newCred.tempPassword}</strong> — they should change it after first login.
        </div>
      )}

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Name</th>
            <th style={th}>Contact</th>
            <th style={th}>Role</th>
            <th style={th}>Status</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {team.map((m) => (
            <tr key={m.id}>
              <td style={td}>{m.name}</td>
              <td style={td}>{m.email ?? m.phone}</td>
              <td style={td}>{m.role}</td>
              <td style={td}>
                <Badge color={m.active ? "#16a34a" : "#6b7280"}>{m.active ? "active" : "inactive"}</Badge>
              </td>
              <td style={td}>
                {m.active && m.role !== "owner" && (
                  <button style={btn} onClick={() => deactivate(m.id)}>
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
