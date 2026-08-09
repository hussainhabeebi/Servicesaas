import { useEffect, useState } from "react";
import { api, type Domain } from "../api";
import { pageTitle, card, table, th, td, Badge, btn, btnPrimary, input } from "../ui";

const STATUS_COLORS: Record<string, string> = { pending: "#6b7280", verifying: "#f59e0b", active: "#16a34a", error: "#dc2626", manual_pending: "#f59e0b" };
const STATUS_LABELS: Record<string, string> = { manual_pending: "setup in progress" };

export function DomainPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"manual" | "custom">("manual");
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
      if (mode === "manual") {
        await api.addManualDomain(newDomain.trim());
        setDnsPreview(null);
      } else {
        const result = await api.addDomain(newDomain.trim());
        setDnsPreview(result.dnsRecords);
      }
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

  async function activate(id: string) {
    if (!confirm("Confirm you've pointed your domain's nameservers at Cloudflare and set up the DNS record + route in that zone? This marks the domain as live.")) return;
    setBusy(true);
    try {
      await api.activateManualDomain(id);
      load();
    } catch (e) {
      setError(String(e));
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

      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", fontSize: "0.85rem" }}>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", cursor: "pointer" }}>
            <input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} />
            Move domain to Cloudflare <span style={{ color: "#16a34a" }}>(recommended, free)</span>
          </label>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", cursor: "pointer" }}>
            <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} />
            Keep domain at current registrar
          </label>
        </div>
        <form onSubmit={add} style={{ display: "flex", gap: "0.6rem" }}>
          <input style={{ ...input, flex: 1 }} placeholder="yourbusiness.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
          <button type="submit" style={btnPrimary} disabled={busy}>
            Connect domain
          </button>
        </form>
        {mode === "manual" ? (
          <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.6rem" }}>
            You'll move DNS management for this domain to Cloudflare (free, automatic SSL). After adding it here, follow the setup steps shown below.
          </p>
        ) : (
          <p style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.6rem" }}>
            Keeps your domain at its current registrar; you'll add a few DNS records there instead.
          </p>
        )}
      </div>

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
                <Badge color={STATUS_COLORS[d.status] ?? "#6b7280"}>{STATUS_LABELS[d.status] ?? d.status}</Badge>
                {d.error_message && <div style={{ fontSize: "0.75rem", color: "#b91c1c", marginTop: "0.2rem" }}>{d.error_message}</div>}
              </td>
              <td style={td}>{d.last_checked_at ? new Date(d.last_checked_at).toLocaleString() : "—"}</td>
              <td style={td}>
                {d.type === "custom" && d.status !== "active" && (
                  <button style={btn} disabled={busy} onClick={() => check(d.id)}>
                    Check status
                  </button>
                )}
                {d.type === "manual" && d.status === "manual_pending" && (
                  <button style={btn} disabled={busy} onClick={() => activate(d.id)}>
                    Mark as active
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {domains.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No domains yet — you're live on your free subdomain already.</p>}

      {domains.some((d) => d.type === "manual" && d.status === "manual_pending") && (
        <div style={{ ...card, background: "#eff6ff", marginTop: "1.5rem" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Finish setup for your domain</div>
          <ol style={{ fontSize: "0.85rem", color: "#1e3a8a", paddingLeft: "1.2rem", lineHeight: 1.7 }}>
            <li>In Cloudflare, click <strong>Add a site</strong> and enter your domain. Choose the Free plan.</li>
            <li>Cloudflare gives you two nameservers — update them at your domain registrar (where you bought the domain), replacing whatever is there now.</li>
            <li>Wait for Cloudflare to show the zone as <strong>Active</strong> (usually well under an hour).</li>
            <li>In that new zone, add DNS records: <code>A</code> record <code>@</code> → <code>192.0.2.1</code> (Proxied), and <code>A</code> record <code>www</code> → <code>192.0.2.1</code> (Proxied).</li>
            <li>Add a Workers Route for <code>yourdomain.com/*</code> and <code>www.yourdomain.com/*</code> pointed at the site engine.</li>
            <li>Visit your domain in a browser to confirm your site loads, then click "Mark as active" above.</li>
          </ol>
          <p style={{ fontSize: "0.78rem", color: "#1e40af", marginTop: "0.5rem" }}>Not comfortable doing this yourself? Ask support and we'll do it for you.</p>
        </div>
      )}
    </div>
  );
}
