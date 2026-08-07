import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type TenantDetail } from "../api";

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!id) return;
    api.getTenant(id).then(setDetail).catch((e) => setError(String(e)));
  };

  useEffect(reload, [id]);

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

      <div style={{ display: "flex", gap: "0.5rem" }}>
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
    </div>
  );
}
