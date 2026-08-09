const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export function getToken(): string | null {
  return localStorage.getItem("tenant_token");
}
export function setToken(token: string) {
  localStorage.setItem("tenant_token", token);
}
export function clearToken() {
  localStorage.removeItem("tenant_token");
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

// --- Auth --------------------------------------------------------------
export async function login(identifier: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) throw new Error("Invalid credentials");
  const data = (await res.json()) as { accessToken: string; user: { name: string; role: string }; tenant: { id: string; subdomain: string } };
  setToken(data.accessToken);
  return data;
}

// --- Types ---------------------------------------------------------------
export interface Lead {
  id: string;
  customer_name: string | null;
  phone: string;
  service_interest: string | null;
  area: string | null;
  mood: "hot" | "warm" | "neutral" | "cold";
  status: "open" | "quoted" | "booked" | "closed";
  notes: string | null;
  created_at: string;
}
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  tags: string[];
  is_repeat_customer: boolean;
  has_active_contract: boolean;
  completed_bookings_count: number;
}
export interface Booking {
  id: string;
  customer_id: string;
  staff_id: string | null;
  service_id: string;
  area: string | null;
  status: "scheduled" | "en_route" | "in_progress" | "completed" | "cancelled";
  scheduled_start: string;
  scheduled_end: string;
  source: string;
}
export interface Service {
  id: string;
  name: string;
  category: string | null;
  duration_minutes: number;
  price: number;
  active: boolean;
  deposit_type: "none" | "fixed" | "percentage";
  deposit_value: number;
}
export interface Staff {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  color: string;
  active: boolean;
  service_areas: string[];
}
export interface StaffAvailability {
  id: string;
  staff_id: string;
  day_of_week: number; // 0=Sunday .. 6=Saturday
  start_time: string; // "09:00"
  end_time: string; // "18:00"
}
export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: "owner" | "staff" | "admin";
  staff_id: string | null;
  active: boolean;
}
export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  kind: "standard" | "deposit";
  status: "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled";
  subtotal: number;
  vat_amount: number;
  total: number;
  amount_paid: number;
  currency: string;
  due_date: string | null;
  created_at: string;
}
export interface Task {
  id: string;
  booking_id: string | null;
  assigned_staff_id: string | null;
  title: string;
  description: string | null;
  type: "job_reminder" | "follow_up" | "general";
  due_at: string | null;
  status: "pending" | "done";
}
export interface Broadcast {
  id: string;
  name: string;
  message_template: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  sent_count: number;
  created_at: string;
}
export interface VendorBill {
  id: string;
  vendor_name: string;
  description: string | null;
  amount: number;
  due_date: string | null;
  status: "unpaid" | "paid";
}
export interface Referral {
  id: string;
  referring_customer_id: string;
  referred_name: string | null;
  referred_phone: string | null;
  reward_status: "pending" | "granted";
  reward_description: string | null;
}
export interface SiteContent {
  businessName?: string;
  heroText?: string;
  hours?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  gallery?: string[];
  testimonials?: Array<{ name: string; quote: string }>;
  languages?: Array<"en" | "ar">;
}
export interface Site {
  id: string;
  template_key: string;
  draft_content: SiteContent;
  live_content: SiteContent | null;
  sections_enabled: string[];
  published_at: string | null;
}
export interface SiteVersion {
  id: string;
  content: SiteContent;
  published_by: string | null;
  created_at: string;
}
export interface DnsRecord {
  type: string;
  name: string;
  value: string;
}
export interface Domain {
  id: string;
  domain: string;
  type: "subdomain" | "custom" | "zone";
  status: "pending" | "verifying" | "active" | "error";
  ssl_status: string | null;
  dns_records: DnsRecord[] | null;
  name_servers: string[] | null;
  error_message: string | null;
  last_checked_at: string | null;
}

// --- API surface -----------------------------------------------------------
export const api = {
  today: () => request<{ todaysBookings: Booking[]; moneyComingInToday: number; moneyOwedOverdue: number }>("/api/stats/today"),
  cashFlowForecast: () => request<{ moneyExpectedThisWeek: number; confirmedJobs: number }>("/api/stats/cash-flow-forecast"),

  leads: () => request<{ leads: Lead[] }>("/api/leads"),
  updateLead: (id: string, body: Partial<Pick<Lead, "status" | "mood" | "notes">>) => request(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  customers: () => request<{ customers: Customer[] }>("/api/customers"),

  bookings: (params?: { from?: string; to?: string }) => {
    const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    return request<{ bookings: Booking[] }>(`/api/bookings${qs}`);
  },
  updateBookingStatus: (id: string, status: Booking["status"]) => request(`/api/bookings/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  assignStaff: (bookingId: string, staffId: string) => request(`/api/bookings/${bookingId}/assign-staff`, { method: "PATCH", body: JSON.stringify({ staff_id: staffId }) }),
  availableStaff: (params: { area?: string; start: string; end: string }) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v))).toString();
    return request<{ staff: Array<{ id: string; name: string; color: string }> }>(`/api/bookings/available-staff?${qs}`);
  },

  services: () => request<{ services: Service[] }>("/api/services"),
  createService: (body: { name: string; category?: string; duration_minutes?: number; price?: number; deposit_type?: Service["deposit_type"]; deposit_value?: number }) =>
    request<{ id: string }>("/api/services", { method: "POST", body: JSON.stringify(body) }),
  updateService: (id: string, body: Partial<Pick<Service, "name" | "category" | "duration_minutes" | "price" | "deposit_type" | "deposit_value">>) =>
    request(`/api/services/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteService: (id: string) => request(`/api/services/${id}`, { method: "DELETE" }),
  staff: () => request<{ staff: Staff[] }>("/api/staff"),
  createStaff: (body: { name: string; phone?: string; email?: string; role?: string; color?: string; service_areas?: string[] }) =>
    request<{ id: string }>("/api/staff", { method: "POST", body: JSON.stringify(body) }),
  updateStaff: (id: string, body: Partial<{ name: string; phone: string; email: string; role: string; color: string; active: boolean; service_areas: string[] }>) =>
    request(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  staffAvailability: (staffId: string) => request<{ availability: StaffAvailability[] }>(`/api/staff/${staffId}/availability`),
  addStaffAvailability: (staffId: string, body: { day_of_week: number; start_time: string; end_time: string }) =>
    request<{ id: string }>(`/api/staff/${staffId}/availability`, { method: "POST", body: JSON.stringify(body) }),
  deleteStaffAvailability: (staffId: string, availabilityId: string) =>
    request(`/api/staff/${staffId}/availability/${availabilityId}`, { method: "DELETE" }),

  invoices: () => request<{ invoices: Invoice[] }>("/api/invoices"),
  sendInvoice: (id: string) => request(`/api/invoices/${id}/send`, { method: "POST" }),

  tasks: (status?: string) => request<{ tasks: Task[] }>(`/api/tasks${status ? `?status=${status}` : ""}`),
  completeTask: (id: string) => request(`/api/tasks/${id}/done`, { method: "PATCH" }),
  createTask: (body: { title: string; type?: string; due_at?: string; assigned_staff_id?: string }) => request("/api/tasks", { method: "POST", body: JSON.stringify(body) }),

  team: () => request<{ team: TeamMember[] }>("/api/team"),
  inviteTeamMember: (body: { name: string; email?: string; phone?: string }) => request<{ id: string; tempPassword: string }>("/api/team/invite", { method: "POST", body: JSON.stringify(body) }),
  deactivateTeamMember: (id: string) => request(`/api/team/${id}/deactivate`, { method: "PATCH" }),

  teamPerformance: (params?: { from?: string; to?: string }) => {
    const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    return request<{ teamPerformance: Array<{ staffId: string; staffName: string; jobsScheduled: number; jobsCompleted: number; jobsCancelled: number }> }>(`/api/reports/team-performance${qs}`);
  },
  winRate: () => request<{ byStatus: Array<{ status: string; count: number }>; totalLeads: number; winRate: number }>("/api/reports/win-rate"),
  arAging: () => request<{ buckets: Record<string, number>; items: Array<{ invoiceId: string; invoiceNumber: string; outstanding: number; daysOverdue: number; bucket: string }> }>("/api/reports/ar-aging"),

  broadcasts: () => request<{ broadcasts: Broadcast[] }>("/api/broadcasts"),
  createBroadcast: (body: { name: string; message_template: string }) => request<{ id: string }>("/api/broadcasts", { method: "POST", body: JSON.stringify(body) }),
  sendBroadcast: (id: string) => request<{ sentCount: number; audienceSize: number }>(`/api/broadcasts/${id}/send`, { method: "POST" }),

  vendorBills: () => request<{ vendorBills: VendorBill[] }>("/api/vendor-bills"),
  createVendorBill: (body: { vendor_name: string; description?: string; amount: number; due_date?: string }) => request<{ id: string }>("/api/vendor-bills", { method: "POST", body: JSON.stringify(body) }),
  payVendorBill: (id: string) => request(`/api/vendor-bills/${id}/pay`, { method: "PATCH" }),

  referrals: () => request<{ referrals: Referral[] }>("/api/referrals"),
  createReferral: (body: { referring_customer_id: string; referred_name?: string; referred_phone?: string }) => request<{ id: string }>("/api/referrals", { method: "POST", body: JSON.stringify(body) }),
  grantReferral: (id: string) => request(`/api/referrals/${id}/grant`, { method: "PATCH", body: JSON.stringify({}) }),

  billing: () => request<{ plan: "starter" | "growth"; subscription_status: string; next_billing_date: string | null; monthlyPrice: number }>("/api/billing"),
  changePlan: (plan: "starter" | "growth") => request("/api/billing/plan", { method: "PATCH", body: JSON.stringify({ plan }) }),

  site: () => request<{ site: Site }>("/api/sites"),
  updateSite: (body: { content?: SiteContent; template_key?: string; sections_enabled?: string[] }) =>
    request<{ ok: true; draftContent: SiteContent }>("/api/sites", { method: "PATCH", body: JSON.stringify(body) }),
  publishSite: () => request<{ ok: true; publishedAt: string }>("/api/sites/publish", { method: "POST" }),
  siteVersions: () => request<{ versions: SiteVersion[] }>("/api/sites/versions"),
  rollbackSiteVersion: (id: string) => request(`/api/sites/versions/${id}/rollback`, { method: "POST" }),

  domains: () => request<{ domains: Domain[] }>("/api/domains"),
  addDomain: (domain: string, mode?: "cname" | "zone") =>
    request<{ id: string; status: string; dnsRecords: DnsRecord[]; nameServers: string[] }>("/api/domains", { method: "POST", body: JSON.stringify({ domain, mode }) }),
  checkDomain: (id: string) => request<{ status: string; sslStatus?: string }>(`/api/domains/${id}/check`, { method: "POST" }),

  whatsappConfig: () => request<{ metaAppId: string | null; embeddedSignupConfigId: string | null }>("/api/whatsapp/config"),
  whatsappStatus: () => request<{ connected: boolean; whatsappNumber: string | null; onboardingType: "coexistence" | "new_number" | null }>("/api/whatsapp/status"),
  whatsappConnect: (body: { code: string; wabaId?: string; phoneNumberId?: string; phoneNumber?: string; onboardingType?: "coexistence" | "new_number" }) =>
    request<{ ok: boolean; whatsappNumber: string | null }>("/api/whatsapp/connect", { method: "POST", body: JSON.stringify(body) }),
};
