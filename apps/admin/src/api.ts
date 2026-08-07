const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

function getToken(): string {
  return localStorage.getItem("admin_token") ?? "";
}

export function setToken(token: string) {
  localStorage.setItem("admin_token", token);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/admin${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface Tenant {
  id: string;
  slug: string;
  business_name: string;
  vertical: string;
  plan: "starter" | "growth";
  status: "active" | "suspended" | "cancelled";
  subdomain: string;
  custom_domain?: string | null;
  created_at: string;
}

export interface TenantDetail {
  tenant: Tenant;
  stats: { bookings: number; customers: number; lifetimeRevenue: number };
}

export interface PlatformStats {
  totalTenants: number;
  activeTenants: number;
  platformRevenue: number;
}

export const api = {
  listTenants: () => request<{ tenants: Tenant[] }>("/tenants"),
  getTenant: (id: string) => request<TenantDetail>(`/tenants/${id}`),
  setTenantStatus: (id: string, status: Tenant["status"]) =>
    request(`/tenants/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  setTenantPlan: (id: string, plan: Tenant["plan"]) =>
    request(`/tenants/${id}/plan`, { method: "PATCH", body: JSON.stringify({ plan }) }),
  platformStats: () => request<PlatformStats>("/stats/platform"),
};
