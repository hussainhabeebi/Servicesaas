import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api";

export function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
      navigate("/");
    } catch {
      setError("Invalid email/phone or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: "2.5rem", borderRadius: 16, width: "100%", maxWidth: 360, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
        <h1 style={{ fontSize: "1.3rem", marginBottom: "1.5rem" }}>ServBazaar</h1>
        <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 4 }}>Email or phone</label>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required style={inputStyle} />
        <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", margin: "0.9rem 0 4px" }}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
        {error && <p style={{ color: "#b91c1c", fontSize: "0.85rem", marginTop: "0.75rem" }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: "100%", marginTop: "1.5rem", padding: "0.8rem", background: "#4F46E5", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", padding: "0.65rem 0.8rem", border: "1px solid #d1d5db", borderRadius: 8 };
