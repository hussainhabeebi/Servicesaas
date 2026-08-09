import { useEffect, useState } from "react";
import { api, type Domain } from "../api";
import { pageTitle, card, table, th, td, Badge, btn, btnPrimary, input } from "../ui";

const STATUS_COLORS: Record<string, string> = { pending: "#6b7280", verifying: "#f59e0b", active: "#16a34a", error: "#dc2626" };

export function DomainPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [mode, setMode] = useState<"cname" | "zone">("cname");
  const [dnsPreview, setDnsPreview] = useState<Domain["dns_records"] | null>(null);
  const [nsPreview, setNsPreview] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.domains().then((r) => setDomains(r.domains)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setBusy(true);
    try {
      const result = await api.addDomain(newDomain.trim(), mode);
      setDnsPreview(result.dnsRecords);
      setNsPreview(result.nameServers.length > 0 ? result.nameServers : null);
      setNewDomain("");
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function check(id: string) {
    setBusy(true);
    try {
      await api.checkDomain(id);
      load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Domain</h1>
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        Your site is always reachable on your free ServBazaar subdomain. Connect your own domain here (Growth plan) for a fully branded address.
      </p>

      <form onSubmit={add} style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.6rem" }}>
          <input style={{ ...input, flex: 1 }} placeholder="yourbusiness.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
          <button type="submit" style={btnPrimary} disabled={busy}>
            Connect domain
          </button>
        </div>
        <div style={{ display: "flex", gap: "1.2rem", marginTop: "0.7rem", fontSize: "0.82rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
            <input type="radio" name="mode" checked={mode === "cname"} onChange={() => setMode("cname")} />
            Keep my current DNS provider (add a record)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
            <input type="radio" name="mode" checked={mode === "zone"} onChange={() => setMode("zone")} />
            Move nameservers to Cloudflare (recommended — more reliable)
          </label>
        </div>
      </form>

      {dnsPreview && dnsPreview.length > 0 && (
        <div style={{ ...card, background: "#fffbeb", marginBottom: "1.5rem" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Add these DNS records at your domain registrar</div>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Type</th>
                <th style={th}>Name</th>
                <th style={th}>Value</th>
              </tr>
            </thead>
            <tbody>
              {dnsPreview.map((r, i) => (
                <tr key={i}>
                  <td style={td}>{r.type}</td>
                  <td style={td}>{r.name}</td>
                  <td style={{ ...td, wordBreak: "break-all" }}>{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: "0.8rem", color: "#92400e", marginTop: "0.5rem" }}>
            Verification can take a few minutes to a few hours depending on your registrar. Use "Check status" below once you've added these.
          </p>
        </div>
      )}

      {nsPreview && (
        <div style={{ ...card, background: "#fffbeb", marginBottom: "1.5rem" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Update your nameservers at your registrar</div>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {nsPreview.map((ns) => (
              <li key={ns} style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{ns}</li>
            ))}
          </ul>
          <p style={{ fontSize: "0.8rem", color: "#92400e", marginTop: "0.5rem" }}>
            Replace your registrar's nameservers with the ones above. This can take a few hours to propagate — once it does, we'll finish setup
            automatically and your domain goes live with no further DNS records to add. Use "Check status" below to track progress.
          </p>
        </div>
      )}

      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Domain</th>
            <th style={th}>Status</th>
            <th style={th}>Last checked</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {domains.map((d) => (
            <tr key={d.id}>
              <td style={td}>
                {d.domain}
                {d.type === "zone" && d.status !== "active" && d.name_servers && d.name_servers.length > 0 && (
                  <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: "0.2rem" }}>
                    Nameservers: {d.name_servers.join(", ")}
                  </div>
                )}
              </td>
              <td style={td}>
                <Badge color={STATUS_COLORS[d.status] ?? "#6b7280"}>{d.status}</Badge>
                {d.error_message && <div style={{ fontSize: "0.75rem", color: "#b91c1c", marginTop: "0.2rem" }}>{d.error_message}</div>}
              </td>
              <td style={td}>{d.last_checked_at ? new Date(d.last_checked_at).toLocaleString() : "—"}</td>
              <td style={td}>
                {(d.type === "custom" || d.type === "zone") && d.status !== "active" && (
                  <button style={btn} disabled={busy} onClick={() => check(d.id)}>
                    Check status
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {domains.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No domains yet — you're live on your free subdomain already.</p>}
    </div>
  );
}
