import { useEffect, useState } from "react";
import { api } from "../api";
import { pageTitle, card, table, th, td } from "../ui";

export function ReportsPage() {
  const [team, setTeam] = useState<Array<{ staffId: string; staffName: string; jobsScheduled: number; jobsCompleted: number; jobsCancelled: number }>>([]);
  const [winRate, setWinRate] = useState<{ totalLeads: number; winRate: number } | null>(null);
  const [aging, setAging] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.teamPerformance(), api.winRate(), api.arAging()])
      .then(([t, w, a]) => {
        setTeam(t.teamPerformance);
        setWinRate(w);
        setAging(a.buckets);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return (
    <div>
      <h1 style={pageTitle}>Reports</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
        <div style={card}>
          <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Lead win rate</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{winRate?.winRate ?? 0}%</div>
          <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{winRate?.totalLeads ?? 0} total leads</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: 6 }}>Accounts receivable aging</div>
          {aging &&
            Object.entries(aging).map(([bucket, amount]) => (
              <div key={bucket} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span>{bucket.replace(/_/g, " ")}</span>
                <strong>AED {amount.toFixed(2)}</strong>
              </div>
            ))}
        </div>
      </div>

      <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>Team performance</h2>
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Staff</th>
            <th style={th}>Scheduled</th>
            <th style={th}>Completed</th>
            <th style={th}>Cancelled</th>
          </tr>
        </thead>
        <tbody>
          {team.map((t) => (
            <tr key={t.staffId}>
              <td style={td}>{t.staffName}</td>
              <td style={td}>{t.jobsScheduled}</td>
              <td style={td}>{t.jobsCompleted}</td>
              <td style={td}>{t.jobsCancelled}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {team.length === 0 && <p style={{ color: "#6b7280", marginTop: "1rem" }}>No staff added yet — solo-operator mode doesn't track per-staff performance.</p>}
    </div>
  );
}
