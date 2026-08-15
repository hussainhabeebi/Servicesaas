import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getToken, clearToken, isStaffOnly } from "./api";
import { useEffect, useState } from "react";
import { InstallPrompt } from "./InstallPrompt";
import { colors } from "./ui";

const OWNER_NAV: Array<{ to: string; label: string; end?: boolean; icon: string }> = [
  { to: "/", label: "Today", end: true, icon: "☀️" },
  { to: "/leads", label: "Leads", icon: "🎯" },
  { to: "/customers", label: "Customers", icon: "👤" },
  { to: "/bookings", label: "Bookings", icon: "📅" },
  { to: "/invoices", label: "Quotes & Invoices", icon: "🧾" },
  { to: "/services", label: "Services", icon: "🧰" },
  { to: "/website", label: "Website", icon: "🌐" },
  { to: "/domain", label: "Domain", icon: "🔗" },
  { to: "/staff", label: "Staff", icon: "🧑‍🔧" },
  { to: "/team", label: "Team", icon: "🧑‍🤝‍🧑" },
  { to: "/whatsapp", label: "WhatsApp", icon: "💬" },
  { to: "/tasks", label: "Tasks", icon: "✅" },
  { to: "/reports", label: "Reports", icon: "📊" },
  { to: "/broadcasts", label: "Broadcasts", icon: "📣" },
  { to: "/vendor-bills", label: "Vendor Bills", icon: "💳" },
  { to: "/billing", label: "Billing", icon: "⚙️" },
];

// Staff-role logins get a short, job-focused nav — not the owner's full back-office menu.
const STAFF_NAV: Array<{ to: string; label: string; end?: boolean; icon: string }> = [
  { to: "/my-jobs", label: "My Jobs", end: true, icon: "🧰" },
  { to: "/tasks", label: "Tasks", icon: "✅" },
];

export function App() {
  const navigate = useNavigate();
  const staffOnly = isStaffOnly();
  const navItems = staffOnly ? STAFF_NAV : OWNER_NAV;
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) navigate("/login");
  }, [navigate]);

  function logout() {
    clearToken();
    navigate("/login");
  }

  const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    padding: "0.6rem 0.75rem",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: "0.9rem",
    color: isActive ? colors.accent : "#374151",
    background: isActive ? colors.accentSoft : "transparent",
    fontWeight: isActive ? 700 : 500,
  });

  const navContent = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "1.5rem", padding: "0 0.5rem" }}>
        <img src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: 7 }} />
        <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>ServBazaar</span>
        {staffOnly && <span style={{ fontSize: "0.65rem", fontWeight: 700, color: colors.inkMuted, background: "#f1f5f9", borderRadius: 999, padding: "0.15rem 0.5rem" }}>STAFF</span>}
      </div>
      <nav style={{ display: "flex", flexDirection: "column", gap: "0.2rem", flex: 1 }}>
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} style={navLinkStyle} onClick={() => setDrawerOpen(false)}>
            <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={logout}
        style={{ marginTop: "1rem", padding: "0.6rem", border: "1px solid #d1d5db", borderRadius: 8, background: "none", cursor: "pointer", fontSize: "0.85rem" }}
      >
        Log out
      </button>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", fontFamily: "-apple-system, system-ui, sans-serif", background: colors.bg }}>
      <InstallPrompt />

      {/* Compact top bar — visible only on narrow viewports, opens the same nav as an overlay drawer */}
      <div className="tenant-topbar" style={{ display: "none", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <img src="/logo.png" alt="" width={26} height={26} style={{ borderRadius: 6 }} />
          <span style={{ fontWeight: 800 }}>ServBazaar</span>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          style={{ border: "none", background: "none", fontSize: "1.4rem", cursor: "pointer", padding: "0.2rem 0.4rem" }}
        >
          ☰
        </button>
      </div>

      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 90 }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{ width: 250, height: "100%", background: colors.surface, padding: "1.5rem 1rem", display: "flex", flexDirection: "column", boxShadow: "8px 0 24px rgba(0,0,0,0.15)" }}
          >
            {navContent}
          </aside>
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }}>
        <aside
          className="tenant-sidebar"
          style={{ width: 220, borderRight: `1px solid ${colors.border}`, padding: "1.5rem 1rem", display: "flex", flexDirection: "column", background: colors.surface }}
        >
          {navContent}
        </aside>
        <main style={{ flex: 1, padding: "2rem", maxWidth: 1100 }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .tenant-sidebar { display: none; }
          .tenant-topbar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
