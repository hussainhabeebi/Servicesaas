import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, appBaseFromSubdomain, type TenantDetail } from "../api";

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string | null; phone: string | null; tempPassword: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => {
    if (!id) return;
    api.getTenant(id).then(setDetail).catch((e) => setError(String(e)));
  };

  useEffect(reload, [id]);

  async function resetPassword() {
    if (!id) return;
    if (!confirm("Reset this tenant's owner password? They'll need the new temp password to log in.")) return;
    setBusy(true);
    try {
      const result = await api.resetTenantPassword(id);
      setResetResult(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loginAsTenant() {
    if (!id) return;
    if (!confirm("Log in as this tenant's owner? This action is audit-logged.")) return;
    setBusy(true);
    try {
      const result = await api.impersonateTenant(id);
      window.open(`${appBaseFromSubdomain(result.subdomain)}/?token=${encodeURIComponent(result.accessToken)}`, "_blank", "noopener");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!detail) return <p>Loading…</p>;
  const { tenant, stats } = detail;

  return (
    <div>
      <h2>{tenant.business_name}</h2>
      <p>
        {tenant.vertical} · {tenant.plan} plan · <strong>{tenant.status}</strong>
      </p>
      <p>{tenant.custom_domain ?? tenant.subdomain}</p>

      <div style={{ display: "flex", gap: "2rem", margin: "1rem 0" }}>
        <div>
          <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>Bookings</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{stats.bookings}</div>
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>Customers</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{stats.customers}</div>
        </div>
        <div>
          <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>Lifetime revenue</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>AED {stats.lifetimeRevenue.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {tenant.status !== "suspended" ? (
          <button onClick={() => api.setTenantStatus(tenant.id, "suspended").then(reload)}>Suspend</button>
        ) : (
          <button onClick={() => api.setTenantStatus(tenant.id, "active").then(reload)}>Reactivate</button>
        )}
        {tenant.plan === "starter" ? (
          <button onClick={() => api.setTenantPlan(tenant.id, "growth").then(reload)}>Upgrade to Growth</button>
        ) : (
          <button onClick={() => api.setTenantPlan(tenant.id, "starter").then(reload)}>Downgrade to Starter</button>
        )}
      </div>

      <h3 style={{ marginTop: "2rem", fontSize: "1rem" }}>Support tools</h3>
      <p style={{ color: "#6b7280", fontSize: "0.82rem", marginTop: "-0.5rem" }}>Both actions are logged to the admin audit trail.</p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button disabled={busy} onClick={resetPassword}>
          Reset owner password
        </button>
        <button disabled={busy} onClick={loginAsTenant}>
          Log in as tenant
        </button>
      </div>

      {resetResult && (
        <div style={{ background: "#eef2ff", padding: "0.9rem", borderRadius: 8, marginTop: "1rem" }}>
          New password for {resetResult.email ?? resetResult.phone}: <strong>{resetResult.tempPassword}</strong>
          <br />
          <span style={{ fontSize: "0.82rem", color: "#4338ca" }}>Relay this to the tenant directly — nothing was sent automatically.</span>
        </div>
      )}
    </div>
  );
}
