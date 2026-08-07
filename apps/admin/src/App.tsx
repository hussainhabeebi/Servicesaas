import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { setToken } from "./api";

export function App() {
  const [token, setTokenInput] = useState(localStorage.getItem("admin_token") ?? "");

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.25rem" }}>ServiceOS — Ops</h1>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link to="/">Overview</Link>
          <Link to="/tenants">Tenants</Link>
        </nav>
      </header>

      <div style={{ marginBottom: "1.5rem", display: "flex", gap: "0.5rem" }}>
        <input
          type="password"
          placeholder="Admin API token"
          value={token}
          onChange={(e) => setTokenInput(e.target.value)}
          style={{ flex: 1, padding: "0.5rem" }}
        />
        <button onClick={() => setToken(token)}>Save token</button>
      </div>

      <Outlet />
    </div>
  );
}
