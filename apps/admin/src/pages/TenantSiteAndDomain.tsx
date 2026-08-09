import { useEffect, useState } from "react";
import { api, type Site, type SiteContent, type Domain } from "../api";

const inputStyle: React.CSSProperties = { padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: 6, width: "100%" };
const labelStyle: React.CSSProperties = { fontSize: "0.78rem", fontWeight: 600, display: "block", marginTop: "0.6rem", marginBottom: 3 };

/** Support tools: admins can view/edit a tenant's website content and manage their custom domain directly — same backend logic as the tenant's own dashboard, see lib/site-management.ts + lib/domain-management.ts. */
export function TenantSiteAndDomain({ tenantId }: { tenantId: string }) {
  const [site, setSite] = useState<Site | null>(null);
  const [form, setForm] = useState<SiteContent>({});
  const [domains, setDomains] = useState<Domain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [mode, setMode] = useState<"cname" | "zone">("cname");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = () => {
    api.getTenantSite(tenantId).then((r) => { setSite(r.site); setForm(r.site.draft_content ?? {}); }).catch(() => {});
    api.getTenantDomains(tenantId).then((r) => setDomains(r.domains)).catch(() => {});
  };
  useEffect(load, [tenantId]);

  async function saveDraft() {
    setBusy(true);
    try {
      await api.updateTenantSite(tenantId, form);
      setStatus("Draft saved.");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!confirm("Publish this tenant's draft website content live?")) return;
    setBusy(true);
    try {
      await api.updateTenantSite(tenantId, form);
      await api.publishTenantSite(tenantId);
      setStatus("Published.");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setBusy(true);
    try {
      await api.addTenantDomain(tenantId, newDomain.trim(), mode);
      setNewDomain("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function checkDomain(domainId: string) {
    setBusy(true);
    try {
      await api.checkTenantDomain(tenantId, domainId);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 style={{ marginTop: "2rem", fontSize: "1rem" }}>Website</h3>
      {site && (
        <>
          <p style={{ color: "#6b7280", fontSize: "0.82rem", marginTop: "-0.5rem" }}>
            {site.published_at ? `Last published ${new Date(site.published_at).toLocaleString()}` : "Not published yet"}
          </p>
          <label style={labelStyle}>Business name</label>
          <input style={inputStyle} value={form.businessName ?? ""} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          <label style={labelStyle}>Hero text</label>
          <input style={inputStyle} value={form.heroText ?? ""} onChange={(e) => setForm({ ...form, heroText: e.target.value })} />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.7rem" }}>
            <button disabled={busy} onClick={saveDraft}>
              Save draft
            </button>
            <button disabled={busy} onClick={publish}>
              Publish
            </button>
          </div>
          {status && <p style={{ color: "#15803d", fontSize: "0.82rem" }}>{status}</p>}
        </>
      )}

      <h3 style={{ marginTop: "2rem", fontSize: "1rem" }}>Domains</h3>
      <form onSubmit={addDomain} style={{ marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input style={inputStyle} placeholder="yourbusiness.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
          <button type="submit" disabled={busy}>
            Add
          </button>
        </div>
        <div style={{ display: "flex", gap: "1rem", marginTop: "0.4rem", fontSize: "0.78rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
            <input type="radio" name="admin-domain-mode" checked={mode === "cname"} onChange={() => setMode("cname")} />
            CNAME (keep existing DNS)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}>
            <input type="radio" name="admin-domain-mode" checked={mode === "zone"} onChange={() => setMode("zone")} />
            Zone (move nameservers to Cloudflare)
          </label>
        </div>
      </form>
      {domains.map((d) => (
        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.85rem" }}>
          <span>
            {d.domain} — <span style={{ color: "#6b7280" }}>{d.status}</span>
            {d.error_message && <span style={{ color: "#b91c1c" }}> ({d.error_message})</span>}
            {d.type === "zone" && d.status !== "active" && d.name_servers && d.name_servers.length > 0 && (
              <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>NS: {d.name_servers.join(", ")}</div>
            )}
          </span>
          {(d.type === "custom" || d.type === "zone") && d.status !== "active" && (
            <button disabled={busy} onClick={() => checkDomain(d.id)} style={{ fontSize: "0.78rem" }}>
              Check status
            </button>
          )}
        </div>
      ))}
      {domains.length === 0 && <p style={{ color: "#6b7280", fontSize: "0.85rem" }}>No domains yet.</p>}
    </div>
  );
}
