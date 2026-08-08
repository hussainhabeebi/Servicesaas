import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getToken, clearToken } from "./api";
import { useEffect } from "react";
import { InstallPrompt } from "./InstallPrompt";

const NAV_ITEMS = [
  { to: "/", label: "Today", end: true },
  { to: "/leads", label: "Leads" },
  { to: "/customers", label: "Customers" },
  { to: "/bookings", label: "Bookings" },
  { to: "/invoices", label: "Quotes & Invoices" },
  { to: "/team", label: "Team" },
  { to: "/tasks", label: "Tasks" },
  { to: "/reports", label: "Reports" },
  { to: "/broadcasts", label: "Broadcasts" },
  { to: "/vendor-bills", label: "Vendor Bills" },
  { to: "/billing", label: "Billing" },
];

export function App() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) navigate("/login");
  }, [navigate]);

  function logout() {
    clearToken();
    navigate("/login");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", fontFamily: "-apple-system, system-ui, sans-serif" }}>
      <InstallPrompt />
      <div style={{ display: "flex", flex: 1 }}>
        <aside style={{ width: 220, borderRight: "1px solid #e5e7eb", padding: "1.5rem 1rem", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "1.5rem", padding: "0 0.5rem" }}>
            <img src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: 7 }} />
            <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>ServBazaar</span>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1 }}>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  padding: "0.55rem 0.7rem",
                  borderRadius: 8,
                  textDecoration: "none",
                  fontSize: "0.9rem",
                  color: isActive ? "#036f71" : "#374151",
                  background: isActive ? "#e6f3f2" : "transparent",
                  fontWeight: isActive ? 700 : 500,
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button onClick={logout} style={{ marginTop: "1rem", padding: "0.6rem", border: "1px solid #d1d5db", borderRadius: 8, background: "none", cursor: "pointer", fontSize: "0.85rem" }}>
            Log out
          </button>
        </aside>
        <main style={{ flex: 1, padding: "2rem", maxWidth: 1100 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
