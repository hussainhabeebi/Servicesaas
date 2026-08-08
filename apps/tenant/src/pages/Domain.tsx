import { useEffect, useState } from "react";
import { api, type Domain } from "../api";
import { pageTitle, card, table, th, td, Badge, btn, btnPrimary, input } from "../ui";

const STATUS_COLORS: Record<string, string> = { pending: "#6b7280", verifying: "#f59e0b", active: "#16a34a", error: "#dc2626" };

export function DomainPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [dnsPreview, setDnsPreview] = useState<Domain["dns_records"] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.domains().then((r) => setDomains(r.domains)).catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setBusy(true);
    try {
      const result = await api.addDomain(newDomain.trim());
      setDnsPreview(result.dnsRecords);
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

      <form onSubmit={add} style={{ ...card, display: "flex", gap: "0.6rem", marginBottom: "1.5rem" }}>
        <input style={{ ...input, flex: 1 }} placeholder="yourbusiness.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
        <button type="submit" style={btnPrimary} disabled={busy}>
          Connect domain
        </button>
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
              <td style={td}>{d.domain}</td>
              <td style={td}>
                <Badge color={STATUS_COLORS[d.status] ?? "#6b7280"}>{d.status}</Badge>
                {d.error_message && <div style={{ fontSize: "0.75rem", color: "#b91c1c", marginTop: "0.2rem" }}>{d.error_message}</div>}
              </td>
              <td style={td}>{d.last_checked_at ? new Date(d.last_checked_at).toLocaleString() : "—"}</td>
              <td style={td}>
                {d.type === "custom" && d.status !== "active" && (
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
