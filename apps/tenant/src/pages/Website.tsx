import { useEffect, useState } from "react";
import { api, type Site, type SiteContent, type SiteVersion } from "../api";
import { pageTitle, card, btn, btnPrimary, input } from "../ui";

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: "pricing", label: "Services & pricing" },
  { key: "gallery", label: "Photo gallery" },
  { key: "testimonials", label: "Testimonials" },
  { key: "service_area_map", label: "Service area" },
];

export function WebsitePage() {
  const [site, setSite] = useState<Site | null>(null);
  const [versions, setVersions] = useState<SiteVersion[]>([]);
  const [form, setForm] = useState<SiteContent>({});
  const [sections, setSections] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.site().then((r) => {
      setSite(r.site);
      setForm(r.site.draft_content ?? {});
      setSections(r.site.sections_enabled ?? []);
    }).catch((e) => setError(String(e)));
    api.siteVersions().then((r) => setVersions(r.versions)).catch(() => {});
  };
  useEffect(() => { void load(); }, []);

  function field<K extends keyof SiteContent>(key: K, value: SiteContent[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSection(key: string) {
    setSections((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }

  async function saveDraft() {
    setBusy(true);
    setStatus(null);
    try {
      await api.updateSite({ content: form, sections_enabled: sections });
      setStatus("Draft saved.");
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!confirm("Publish your draft? This makes it live on your public website immediately.")) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.updateSite({ content: form, sections_enabled: sections });
      await api.publishSite();
      setStatus("Published — your website is now live with these changes.");
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rollback(id: string) {
    if (!confirm("Roll back to this version? This replaces both your draft and live site.")) return;
    await api.rollbackSiteVersion(id);
    load();
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!site) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={pageTitle}>Website</h1>
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
        {site.published_at ? `Last published ${new Date(site.published_at).toLocaleString()}.` : "Not published yet."} Changes here only go live once you hit Publish.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={card}>
          <label style={labelStyle}>Business name</label>
          <input style={input} value={form.businessName ?? ""} onChange={(e) => field("businessName", e.target.value)} />
          <label style={{ ...labelStyle, marginTop: "0.8rem" }}>Hero text</label>
          <input style={input} value={form.heroText ?? ""} onChange={(e) => field("heroText", e.target.value)} placeholder="Spotless homes, booked in minutes" />
          <label style={{ ...labelStyle, marginTop: "0.8rem" }}>Hours</label>
          <input style={input} value={form.hours ?? ""} onChange={(e) => field("hours", e.target.value)} placeholder="Mon-Sat 8am-8pm" />
          <label style={{ ...labelStyle, marginTop: "0.8rem" }}>Phone</label>
          <input style={input} value={form.phone ?? ""} onChange={(e) => field("phone", e.target.value)} />
          <label style={{ ...labelStyle, marginTop: "0.8rem" }}>Address</label>
          <input style={input} value={form.address ?? ""} onChange={(e) => field("address", e.target.value)} />
          <label style={{ ...labelStyle, marginTop: "0.8rem" }}>Logo URL</label>
          <input style={input} value={form.logoUrl ?? ""} onChange={(e) => field("logoUrl", e.target.value)} placeholder="https://…" />
        </div>

        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.6rem" }}>Sections shown on your site</div>
          {SECTIONS.map((s) => (
            <label key={s.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.35rem 0", fontSize: "0.88rem" }}>
              <input type="checkbox" checked={sections.includes(s.key)} onChange={() => toggleSection(s.key)} />
              {s.label}
            </label>
          ))}
          <div style={{ fontWeight: 700, fontSize: "0.9rem", margin: "1rem 0 0.5rem" }}>Testimonials</div>
          {(form.testimonials ?? []).map((t, i) => (
            <div key={i} style={{ fontSize: "0.82rem", color: "#374151", marginBottom: "0.3rem" }}>
              "{t.quote}" — {t.name}
            </div>
          ))}
          <button
            type="button"
            style={{ ...btn, fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}
            onClick={() => {
              const name = prompt("Customer name?");
              const quote = name && prompt("Their quote?");
              if (name && quote) field("testimonials", [...(form.testimonials ?? []), { name, quote }]);
            }}
          >
            Add testimonial
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem" }}>
        <button style={btn} disabled={busy} onClick={saveDraft}>
          Save draft
        </button>
        <button style={btnPrimary} disabled={busy} onClick={publish}>
          Publish
        </button>
      </div>
      {status && <p style={{ color: "#15803d", fontSize: "0.88rem" }}>{status}</p>}

      {versions.length > 0 && (
        <>
          <h3 style={{ fontSize: "1rem", marginTop: "2rem" }}>Version history</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {versions.map((v) => (
              <div key={v.id} style={{ ...card, padding: "0.7rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>{new Date(v.created_at).toLocaleString()}</span>
                <button style={{ ...btn, fontSize: "0.78rem", padding: "0.3rem 0.6rem" }} onClick={() => rollback(v.id)}>
                  Roll back to this
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: "0.78rem", fontWeight: 600, display: "block", marginBottom: 3 };
