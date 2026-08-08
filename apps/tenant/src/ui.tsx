import type { CSSProperties } from "react";

export const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.25rem", background: "#fff" };
export const table: CSSProperties = { width: "100%", borderCollapse: "collapse" };
export const th: CSSProperties = { textAlign: "left", padding: "0.6rem 0.5rem", borderBottom: "2px solid #e5e7eb", fontSize: "0.8rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.02em" };
export const td: CSSProperties = { padding: "0.6rem 0.5rem", borderBottom: "1px solid #f3f4f6", fontSize: "0.9rem" };
export const btn: CSSProperties = { padding: "0.5rem 0.9rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 };
export const btnPrimary: CSSProperties = { ...btn, background: "#4F46E5", color: "#fff", border: "none" };
export const input: CSSProperties = { padding: "0.55rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem" };
export const pageTitle: CSSProperties = { fontSize: "1.4rem", marginBottom: "1.25rem" };

export function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ background: color, color: "#fff", borderRadius: 999, padding: "0.15rem 0.6rem", fontSize: "0.75rem", fontWeight: 700 }}>{children}</span>;
}

export const MOOD_COLORS: Record<string, string> = { hot: "#dc2626", warm: "#f59e0b", neutral: "#6b7280", cold: "#3b82f6" };
export const STATUS_COLORS: Record<string, string> = {
  open: "#6b7280",
  quoted: "#f59e0b",
  booked: "#16a34a",
  closed: "#374151",
  scheduled: "#4F46E5",
  en_route: "#f59e0b",
  in_progress: "#0ea5e9",
  completed: "#16a34a",
  cancelled: "#dc2626",
  draft: "#6b7280",
  sent: "#4F46E5",
  paid: "#16a34a",
  partial: "#f59e0b",
  overdue: "#dc2626",
  pending: "#f59e0b",
  done: "#16a34a",
  granted: "#16a34a",
  unpaid: "#dc2626",
};
