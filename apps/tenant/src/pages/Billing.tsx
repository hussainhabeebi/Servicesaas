import { useEffect, useState } from "react";
import { api } from "../api";
import { pageTitle, card, btnPrimary } from "../ui";

export function BillingPage() {
  const [plan, setPlan] = useState<"starter" | "growth" | null>(null);
  const [price, setPrice] = useState(0);
  const [nextBilling, setNextBilling] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  const load = () =>
    api
      .billing()
      .then((r) => {
        setPlan(r.plan);
        setPrice(r.monthlyPrice);
        setNextBilling(r.next_billing_date);
        setStatus(r.subscription_status);
      })
      .catch((e) => setError(String(e)));
  useEffect(() => { void load(); }, []);

  async function changePlan(newPlan: "starter" | "growth") {
    setChanging(true);
    try {
      await api.changePlan(newPlan);
      load();
    } finally {
      setChanging(false);
    }
  }

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;
  if (!plan) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={pageTitle}>Billing</h1>
      <p style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: "-1rem", marginBottom: "1.5rem" }}>
        This shows your current plan and lets you change it — it doesn't yet auto-charge a saved card each month, so billing is tracked manually until that's wired up.
      </p>
      <div style={{ ...card, maxWidth: 420 }}>
        <div style={{ fontSize: "0.8rem", color: "#6b7280", textTransform: "uppercase" }}>Current plan</div>
        <div style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0.3rem 0" }}>
          {plan === "starter" ? "Starter" : "Growth"} — AED {price}/mo
        </div>
        <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Status: {status}</div>
        {nextBilling && <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Next billing: {new Date(nextBilling).toLocaleDateString()}</div>}
        <div style={{ marginTop: "1.25rem" }}>
          {plan === "starter" ? (
            <button style={btnPrimary} disabled={changing} onClick={() => changePlan("growth")}>
              Upgrade to Growth (AED 199/mo)
            </button>
          ) : (
            <button style={btnPrimary} disabled={changing} onClick={() => changePlan("starter")}>
              Downgrade to Starter (AED 99/mo)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
