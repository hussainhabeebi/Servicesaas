const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export function getToken(): string | null {
  return localStorage.getItem("admin_token");
}
export function setToken(token: string) {
  localStorage.setItem("admin_token", token);
}
export function clearToken() {
  localStorage.removeItem("admin_token");
  localStorage.removeItem("admin_name");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${getToken() ?? ""}`, "Content-Type": "application/json" },
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/admin-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Invalid credentials" }))).error ?? "Invalid credentials");
  const data = (await res.json()) as { accessToken: string; admin: { id: string; name: string; email: string } };
  setToken(data.accessToken);
  localStorage.setItem("admin_name", data.admin.name);
  return data;
}

/** app.{rootDomain} — derived from tenant.subdomain ({slug}.{rootDomain} by construction, not a guess), not by string-parsing VITE_API_BASE. */
export function appBaseFromSubdomain(subdomain: string): string {
  const rootDomain = subdomain.split(".").slice(1).join(".");
  return `https://app.${rootDomain}`;
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

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface SiteContent {
  businessName?: string;
  heroText?: string;
  hours?: string;
  phone?: string;
}
export interface Site {
  id: string;
  template_key: string;
  draft_content: SiteContent;
  live_content: SiteContent | null;
  sections_enabled: string[];
  published_at: string | null;
}
export interface DnsRecord {
  type: string;
  name: string;
  value: string;
}
export interface Domain {
  id: string;
  domain: string;
  type: "subdomain" | "custom";
  status: "pending" | "verifying" | "active" | "error";
  error_message: string | null;
  last_checked_at: string | null;
}

export const api = {
  listTenants: () => request<{ tenants: Tenant[] }>("/admin/tenants"),
  getTenant: (id: string) => request<TenantDetail>(`/admin/tenants/${id}`),
  setTenantStatus: (id: string, status: Tenant["status"]) =>
    request(`/admin/tenants/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  setTenantPlan: (id: string, plan: Tenant["plan"]) =>
    request(`/admin/tenants/${id}/plan`, { method: "PATCH", body: JSON.stringify({ plan }) }),
  resetTenantPassword: (id: string) =>
    request<{ tenantUserId: string; email: string | null; phone: string | null; tempPassword: string }>(`/admin/tenants/${id}/reset-password`, { method: "POST" }),
  impersonateTenant: (id: string) => request<{ accessToken: string; subdomain: string }>(`/admin/tenants/${id}/impersonate`, { method: "POST" }),
  platformStats: () => request<PlatformStats>("/admin/stats/platform"),

  listAdmins: () => request<{ admins: AdminUser[] }>("/admin/users"),
  inviteAdmin: (name: string, email: string) =>
    request<{ id: string; tempPassword: string }>("/admin/users", { method: "POST", body: JSON.stringify({ name, email }) }),
  deactivateAdmin: (id: string) => request(`/admin/users/${id}/deactivate`, { method: "PATCH" }),

  getTenantSite: (tenantId: string) => request<{ site: Site }>(`/admin/tenants/${tenantId}/site`),
  updateTenantSite: (tenantId: string, content: SiteContent) =>
    request<{ ok: true; draftContent: SiteContent }>(`/admin/tenants/${tenantId}/site`, { method: "PATCH", body: JSON.stringify({ content }) }),
  publishTenantSite: (tenantId: string) => request<{ ok: true; publishedAt: string }>(`/admin/tenants/${tenantId}/site/publish`, { method: "POST" }),

  getTenantDomains: (tenantId: string) => request<{ domains: Domain[] }>(`/admin/tenants/${tenantId}/domains`),
  addTenantDomain: (tenantId: string, domain: string) =>
    request<{ id: string; status: string; dnsRecords: DnsRecord[] }>(`/admin/tenants/${tenantId}/domains`, { method: "POST", body: JSON.stringify({ domain }) }),
  checkTenantDomain: (tenantId: string, domainId: string) =>
    request<{ status: string }>(`/admin/tenants/${tenantId}/domains/${domainId}/check`, { method: "POST" }),
};
