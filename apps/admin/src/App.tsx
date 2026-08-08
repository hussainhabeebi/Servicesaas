import { useEffect } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { getToken, clearToken } from "./api";

export function App() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!getToken()) navigate("/login");
  }, [navigate]);

  function logout() {
    clearToken();
    navigate("/login");
  }

  const adminName = localStorage.getItem("admin_name");

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.25rem" }}>ServBazaar — Ops</h1>
        <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link to="/">Overview</Link>
          <Link to="/tenants">Tenants</Link>
          <Link to="/admins">Admins</Link>
          {adminName && <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>{adminName}</span>}
          <button onClick={logout} style={{ padding: "0.4rem 0.8rem", border: "1px solid #d1d5db", borderRadius: 6, background: "none", cursor: "pointer", fontSize: "0.85rem" }}>
            Log out
          </button>
        </nav>
      </header>

      <Outlet />
    </div>
  );
}
