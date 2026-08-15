import type { CSSProperties } from "react";

/** Shared design tokens — introduced alongside the modernized App shell/Today/My Jobs; older pages keep using the plain helpers below untouched. */
export const colors = {
  ink: "#0f172a",
  inkMuted: "#64748b",
  bg: "#f6f8f7",
  surface: "#ffffff",
  border: "#e2e8f0",
  accent: "#036f71",
  accentSoft: "#e6f3f2",
  warn: "#b45309",
  warnSoft: "#fef3e2",
  danger: "#dc2626",
  dangerSoft: "#fee2e2",
  good: "#16a34a",
  goodSoft: "#dcfce7",
};

export const card: CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.25rem", background: "#fff" };
export const table: CSSProperties = { width: "100%", borderCollapse: "collapse" };
export const th: CSSProperties = { textAlign: "left", padding: "0.6rem 0.5rem", borderBottom: "2px solid #e5e7eb", fontSize: "0.8rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.02em" };
export const td: CSSProperties = { padding: "0.6rem 0.5rem", borderBottom: "1px solid #f3f4f6", fontSize: "0.9rem" };
export const btn: CSSProperties = { padding: "0.5rem 0.9rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 };
export const btnPrimary: CSSProperties = { ...btn, background: "#036f71", color: "#fff", border: "none" };
export const input: CSSProperties = { padding: "0.55rem 0.75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: "0.9rem" };
export const pageTitle: CSSProperties = { fontSize: "1.4rem", marginBottom: "1.25rem" };

export function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ background: color, color: "#fff", borderRadius: 999, padding: "0.15rem 0.6rem", fontSize: "0.75rem", fontWeight: 700 }}>{children}</span>;
}

/** Softer than Badge — a background/foreground pair instead of solid fill, used on the suggestion widgets. */
export function Pill({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return <span style={{ background: bg, color: fg, borderRadius: 999, padding: "0.2rem 0.65rem", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap" }}>{children}</span>;
}

export const MOOD_COLORS: Record<string, string> = { hot: "#dc2626", warm: "#f59e0b", neutral: "#6b7280", cold: "#3b82f6" };
export const STATUS_COLORS: Record<string, string> = {
  open: "#6b7280",
  quoted: "#f59e0b",
  booked: "#16a34a",
  closed: "#374151",
  scheduled: "#036f71",
  en_route: "#f59e0b",
  in_progress: "#0ea5e9",
  completed: "#16a34a",
  cancelled: "#dc2626",
  draft: "#6b7280",
  sent: "#036f71",
  paid: "#16a34a",
  partial: "#f59e0b",
  overdue: "#dc2626",
  pending: "#f59e0b",
  done: "#16a34a",
  granted: "#16a34a",
  unpaid: "#dc2626",
};
