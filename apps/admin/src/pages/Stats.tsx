import { useEffect, useState } from "react";
import { api, type PlatformStats } from "../api";

export function StatsPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.platformStats().then(setStats).catch((e) => setError(String(e)));
  }, []);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!stats) return <p>Loading…</p>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
      <Card label="Total tenants" value={stats.totalTenants} />
      <Card label="Active tenants" value={stats.activeTenants} />
      <Card label="Platform revenue" value={`AED ${stats.platformRevenue.toFixed(2)}`} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "1rem" }}>
      <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 600 }}>{value}</div>
    </div>
  );
}
