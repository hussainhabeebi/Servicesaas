import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamps = {
  created_at: text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updated_at: text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

// ---------------------------------------------------------------------------
// Tenants & Users
// ---------------------------------------------------------------------------

export const tenants = sqliteTable(
  "tenants",
  {
    id: id(),
    slug: text("slug").notNull(), // business-slug used for {slug}.yourapp.com
    business_name: text("business_name").notNull(),
    vertical: text("vertical").notNull(), // cleaning|salon|repair|tutoring|pet_care|fitness|spa_laundry|generic
    plan: text("plan").notNull().default("starter"), // starter|growth
    status: text("status").notNull().default("active"), // active|suspended|cancelled
    locale: text("locale").notNull().default("en"), // en|ar
    timezone: text("timezone").notNull().default("Asia/Dubai"),
    currency: text("currency").notNull().default("AED"),
    vat_rate: real("vat_rate").notNull().default(0.05),
    subdomain: text("subdomain").notNull(), // {slug}.yourapp.com
    custom_domain: text("custom_domain"),
    bot_persona_name: text("bot_persona_name"), // e.g. "Aisha" — persona-based bot naming
    address: text("address"),
    // WhatsApp is self-serve per tenant: each one connects their own number
    // via Meta's Embedded Signup during onboarding, which provisions a
    // dedicated Chatwoot Account (not just an inbox) for that tenant — see
    // routes/whatsapp-connect.ts. chatwoot_account_id is required on every
    // Chatwoot API call now that accounts aren't shared across tenants.
    whatsapp_number: text("whatsapp_number"), // E.164, for the public wa.me click-to-chat link
    chatwoot_account_id: integer("chatwoot_account_id"),
    chatwoot_inbox_id: integer("chatwoot_inbox_id"),
    // Which Embedded Signup path the tenant completed — 'coexistence' means
    // they kept their existing WhatsApp Business app number connected
    // (Meta's app+API coexistence feature), 'new_number' means they set up
    // a Cloud-API-only number. Support/analytics only; both are fully
    // functional once connected. See routes/whatsapp-connect.ts.
    onboarding_type: text("onboarding_type"), // coexistence|new_number|null (not connected yet)
    // Self-serve billing (spec: "manage your own subscription") — tracks
    // the platform subscription itself, separate from the payment gateway
    // wrappers in payments/*, which are for the TENANT's own customers
    // paying THEM. No recurring-charge automation is wired up yet (none of
    // Razorpay/PhonePe/Telr/Network International's wrappers here support
    // subscription billing, only one-off payment links) — this is state
    // tracking + a plan-change UI, not automated dunning/collection.
    subscription_status: text("subscription_status").notNull().default("active"), // active|past_due|cancelled
    next_billing_date: text("next_billing_date"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tenants_slug_idx").on(t.slug),
    uniqueIndex("tenants_subdomain_idx").on(t.subdomain),
    uniqueIndex("tenants_chatwoot_inbox_idx").on(t.chatwoot_inbox_id),
  ]
);

export const tenantUsers = sqliteTable(
  "tenant_users",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    password_hash: text("password_hash").notNull(),
    role: text("role").notNull().default("owner"), // owner|staff|admin
    staff_id: text("staff_id"), // links a login to the operational staff/crew record used for job assignment — nullable, owner accounts have none
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    // Brute-force lockout — see routes/auth.ts. Reset to 0/null on any
    // successful login; locked_until blocks further attempts (even correct
    // ones) until it passes.
    failed_login_attempts: integer("failed_login_attempts").notNull().default(0),
    locked_until: text("locked_until"),
    ...timestamps,
  },
  (t) => [
    index("tenant_users_tenant_idx").on(t.tenant_id),
    uniqueIndex("tenant_users_tenant_email_idx").on(t.tenant_id, t.email),
  ]
);

// ---------------------------------------------------------------------------
// Platform admin accounts (internal ops — distinct from tenant_users, which
// are per-tenant business logins). See routes/admin-auth.ts,
// routes/admin-bootstrap.ts.
// ---------------------------------------------------------------------------

export const adminUsers = sqliteTable(
  "admin_users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    password_hash: text("password_hash").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    failed_login_attempts: integer("failed_login_attempts").notNull().default(0),
    locked_until: text("locked_until"),
    last_login_at: text("last_login_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("admin_users_email_idx").on(t.email)]
);

/** Sensitive-action trail for the admin panel — password resets and impersonation, specifically. */
export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: id(),
    admin_user_id: text("admin_user_id").notNull(),
    action: text("action").notNull(), // reset_tenant_password|impersonate_tenant|edit_tenant_site|publish_tenant_site|add_tenant_domain|activate_tenant_domain
    target_tenant_id: text("target_tenant_id"),
    detail: text("detail"),
    created_at: timestamps.created_at,
  },
  (t) => [index("admin_audit_log_admin_idx").on(t.admin_user_id), index("admin_audit_log_tenant_idx").on(t.target_tenant_id)]
);

export const refreshTokens = sqliteTable(
  "refresh_tokens",
  {
    id: id(),
    tenant_user_id: text("tenant_user_id").notNull(),
    token_hash: text("token_hash").notNull(),
    expires_at: text("expires_at").notNull(),
    revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
    created_at: timestamps.created_at,
  },
  (t) => [index("refresh_tokens_user_idx").on(t.tenant_user_id)]
);

// ---------------------------------------------------------------------------
// Customers / CRM
// ---------------------------------------------------------------------------

export const customers = sqliteTable(
  "customers",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    notes: text("notes"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]), // VIP, at-risk, referral
    preferences: text("preferences", { mode: "json" }).$type<Record<string, unknown>>().default({}),
    is_repeat_customer: integer("is_repeat_customer", { mode: "boolean" }).notNull().default(false),
    has_active_contract: integer("has_active_contract", { mode: "boolean" }).notNull().default(false),
    // Incremented whenever one of this customer's bookings is marked
    // completed (bookings.ts) — powers the loyalty milestone badge in the
    // Customers UI. Simple counter, no separate rewards ledger yet.
    completed_bookings_count: integer("completed_bookings_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("customers_tenant_idx").on(t.tenant_id),
    uniqueIndex("customers_tenant_phone_idx").on(t.tenant_id, t.phone),
  ]
);

export const customerAddresses = sqliteTable(
  "customer_addresses",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    customer_id: text("customer_id").notNull(),
    label: text("label").notNull().default("Home"),
    address_line: text("address_line").notNull(),
    area: text("area"),
    city: text("city"),
    lat: real("lat"),
    lng: real("lng"),
    is_default: integer("is_default", { mode: "boolean" }).notNull().default(false),
    created_at: timestamps.created_at,
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customer_id)]
);

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const staff = sqliteTable(
  "staff",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    role: text("role").notNull().default("technician"),
    color: text("color").notNull().default("#4F46E5"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    // Neighbourhoods/zones this staff member covers, matched against a
    // booking's area on creation (see lib/staff-matching.ts). Empty = covers
    // every area, so existing solo-operator tenants need no setup.
    service_areas: text("service_areas", { mode: "json" }).$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("staff_tenant_idx").on(t.tenant_id)]
);

export const staffAvailability = sqliteTable(
  "staff_availability",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    staff_id: text("staff_id").notNull(),
    day_of_week: integer("day_of_week").notNull(), // 0=Sunday .. 6=Saturday
    start_time: text("start_time").notNull(), // "09:00"
    end_time: text("end_time").notNull(), // "18:00"
  },
  (t) => [index("staff_availability_staff_idx").on(t.staff_id)]
);

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export const services = sqliteTable(
  "services",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    duration_minutes: integer("duration_minutes").notNull().default(60),
    price: real("price").notNull().default(0),
    description: text("description"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    recurrence_options: text("recurrence_options", { mode: "json" }).$type<string[]>().default([]), // weekly|biweekly|monthly
    // No-show protection: a deposit invoice auto-generates at booking time
    // when set (see lib/deposits.ts). 'none' keeps today's no-deposit
    // behavior with zero setup.
    deposit_type: text("deposit_type").notNull().default("none"), // none|fixed|percentage
    deposit_value: real("deposit_value").notNull().default(0), // AED amount if fixed, 0-100 if percentage
    ...timestamps,
  },
  (t) => [index("services_tenant_idx").on(t.tenant_id)]
);

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const bookings = sqliteTable(
  "bookings",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    customer_id: text("customer_id").notNull(),
    staff_id: text("staff_id"),
    service_id: text("service_id").notNull(),
    address_id: text("address_id"),
    // Free-text area/neighbourhood the job is at — same convention as
    // leads.area / customer_addresses.area. Captured regardless of source
    // so staff-matching (lib/staff-matching.ts) has something to match on
    // even for WhatsApp bookings, which don't collect a full address.
    area: text("area"),
    status: text("status").notNull().default("scheduled"), // scheduled|en_route|in_progress|completed|cancelled
    scheduled_start: text("scheduled_start").notNull(),
    scheduled_end: text("scheduled_end").notNull(),
    recurrence_rule: text("recurrence_rule"), // weekly|biweekly|monthly|null
    parent_booking_id: text("parent_booking_id"),
    source: text("source").notNull().default("app"), // app|whatsapp|website
    checkin_at: text("checkin_at"),
    checkin_lat: real("checkin_lat"),
    checkin_lng: real("checkin_lng"),
    checkout_at: text("checkout_at"),
    checkout_lat: real("checkout_lat"),
    checkout_lng: real("checkout_lng"),
    cancellation_reason: text("cancellation_reason"),
    cancellation_fee: real("cancellation_fee"),
    no_show_risk_score: real("no_show_risk_score"), // AI no-show predictor
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("bookings_tenant_idx").on(t.tenant_id),
    index("bookings_staff_time_idx").on(t.staff_id, t.scheduled_start),
    index("bookings_customer_idx").on(t.customer_id),
  ]
);

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    booking_id: text("booking_id"),
    customer_id: text("customer_id").notNull(),
    invoice_number: text("invoice_number").notNull(),
    kind: text("kind").notNull().default("standard"), // standard|deposit — deposit invoices are auto-created by lib/deposits.ts
    status: text("status").notNull().default("draft"), // draft|sent|paid|partial|overdue|cancelled
    subtotal: real("subtotal").notNull().default(0),
    vat_amount: real("vat_amount").notNull().default(0),
    total: real("total").notNull().default(0),
    amount_paid: real("amount_paid").notNull().default(0),
    currency: text("currency").notNull().default("AED"),
    due_date: text("due_date"),
    pdf_r2_key: text("pdf_r2_key"),
    sent_at: text("sent_at"),
    paid_at: text("paid_at"),
    ...timestamps,
  },
  (t) => [
    index("invoices_tenant_idx").on(t.tenant_id),
    uniqueIndex("invoices_tenant_number_idx").on(t.tenant_id, t.invoice_number),
  ]
);

export const invoiceLineItems = sqliteTable(
  "invoice_line_items",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    invoice_id: text("invoice_id").notNull(),
    kind: text("kind").notNull().default("labor"), // labor|materials|addon
    description: text("description").notNull(),
    quantity: real("quantity").notNull().default(1),
    unit_price: real("unit_price").notNull().default(0),
    total: real("total").notNull().default(0),
  },
  (t) => [index("invoice_line_items_invoice_idx").on(t.invoice_id)]
);

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    invoice_id: text("invoice_id").notNull(),
    method: text("method").notNull(), // cash|card|bank_transfer|payment_link
    gateway: text("gateway"), // razorpay|phonepe|telr|network_international
    gateway_ref: text("gateway_ref"),
    amount: real("amount").notNull(),
    status: text("status").notNull().default("pending"), // pending|success|failed|refunded
    paid_at: text("paid_at"),
    created_at: timestamps.created_at,
  },
  (t) => [index("payments_invoice_idx").on(t.invoice_id), index("payments_tenant_idx").on(t.tenant_id)]
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    booking_id: text("booking_id"),
    kind: text("kind").notNull().default("materials"), // materials|wages|other
    description: text("description"),
    amount: real("amount").notNull(),
    created_at: timestamps.created_at,
  },
  (t) => [index("expenses_tenant_idx").on(t.tenant_id)]
);

// ---------------------------------------------------------------------------
// Leads (pre-booking pipeline)
// ---------------------------------------------------------------------------

export const leads = sqliteTable(
  "leads",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    customer_name: text("customer_name"),
    phone: text("phone").notNull(),
    service_interest: text("service_interest"),
    area: text("area"),
    mood: text("mood").notNull().default("neutral"), // hot|warm|neutral|cold
    status: text("status").notNull().default("open"), // open|quoted|booked|closed
    source: text("source").notNull().default("whatsapp"), // whatsapp|website|ads|manual
    notes: text("notes"),
    converted_booking_id: text("converted_booking_id"),
    ...timestamps,
  },
  (t) => [index("leads_tenant_idx").on(t.tenant_id), index("leads_tenant_status_idx").on(t.tenant_id, t.status)]
);

// ---------------------------------------------------------------------------
// WhatsApp (transported via Chatwoot — see platform/src/whatsapp/chatwoot.ts)
// ---------------------------------------------------------------------------

export const whatsappConversations = sqliteTable(
  "whatsapp_conversations",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    customer_phone: text("customer_phone").notNull(),
    contact_id: text("contact_id"), // nullable ref -> customers.id
    chatwoot_conversation_id: integer("chatwoot_conversation_id"), // conversation on the tenant's Chatwoot inbox
    last_message_at: text("last_message_at"),
    unread_count: integer("unread_count").notNull().default(0),
    created_at: timestamps.created_at,
  },
  (t) => [
    index("wa_conversations_tenant_idx").on(t.tenant_id),
    uniqueIndex("wa_conversations_tenant_phone_idx").on(t.tenant_id, t.customer_phone),
  ]
);

export const whatsappMessages = sqliteTable(
  "whatsapp_messages",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    conversation_id: text("conversation_id").notNull(),
    direction: text("direction").notNull(), // in|out
    message_type: text("message_type").notNull().default("text"), // text|image|audio|template|interactive
    body: text("body"),
    media_r2_key: text("media_r2_key"),
    wa_message_id: text("wa_message_id"),
    status: text("status").default("sent"), // sent|delivered|read|failed
    created_at: timestamps.created_at,
  },
  (t) => [index("wa_messages_conversation_idx").on(t.conversation_id)]
);

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const reviews = sqliteTable(
  "reviews",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    booking_id: text("booking_id"),
    customer_id: text("customer_id"),
    rating: integer("rating"),
    comment: text("comment"),
    google_review_clicked: integer("google_review_clicked", { mode: "boolean" }).notNull().default(false),
    requested_at: text("requested_at"),
    submitted_at: text("submitted_at"),
    created_at: timestamps.created_at,
  },
  (t) => [index("reviews_tenant_idx").on(t.tenant_id)]
);

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export const domains = sqliteTable(
  "domains",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    domain: text("domain").notNull(),
    type: text("type").notNull().default("subdomain"), // subdomain|custom|manual
    status: text("status").notNull().default("pending"), // pending|verifying|active|error|manual_pending
    cf_hostname_id: text("cf_hostname_id"),
    ssl_status: text("ssl_status"),
    dns_records: text("dns_records", { mode: "json" }).$type<Array<{ type: string; name: string; value: string }>>(),
    error_message: text("error_message"),
    last_checked_at: text("last_checked_at"),
    created_at: timestamps.created_at,
  },
  (t) => [index("domains_tenant_idx").on(t.tenant_id), uniqueIndex("domains_domain_idx").on(t.domain)]
);

// ---------------------------------------------------------------------------
// Website / Site engine
// ---------------------------------------------------------------------------

export const sites = sqliteTable(
  "sites",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    template_key: text("template_key").notNull().default("generic"),
    draft_content: text("draft_content", { mode: "json" }).$type<Record<string, unknown>>().default({}),
    live_content: text("live_content", { mode: "json" }).$type<Record<string, unknown>>(),
    sections_enabled: text("sections_enabled", { mode: "json" })
      .$type<string[]>()
      .default(["gallery", "testimonials", "pricing", "service_area_map"]),
    languages: text("languages", { mode: "json" }).$type<string[]>().default(["en"]),
    published_at: text("published_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("sites_tenant_idx").on(t.tenant_id)]
);

export const siteVersions = sqliteTable(
  "site_versions",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    site_id: text("site_id").notNull(),
    content: text("content", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    published_by: text("published_by"),
    created_at: timestamps.created_at,
  },
  (t) => [index("site_versions_site_idx").on(t.site_id)]
);

// ---------------------------------------------------------------------------
// Marketing: Ads, broadcast campaigns, social posts
// ---------------------------------------------------------------------------

export const adCampaigns = sqliteTable(
  "ad_campaigns",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    service_id: text("service_id"),
    name: text("name").notNull(),
    status: text("status").notNull().default("draft"), // draft|active|paused|ended
    daily_budget: real("daily_budget"),
    radius_km: real("radius_km").default(10),
    center_lat: real("center_lat"),
    center_lng: real("center_lng"),
    google_campaign_id: text("google_campaign_id"),
    call_tracking_number: text("call_tracking_number"),
    spend: real("spend").notNull().default(0),
    bookings_attributed: integer("bookings_attributed").notNull().default(0),
    revenue_attributed: real("revenue_attributed").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("ad_campaigns_tenant_idx").on(t.tenant_id)]
);

export const broadcastCampaigns = sqliteTable(
  "broadcast_campaigns",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    name: text("name").notNull(),
    message_template: text("message_template").notNull(),
    audience_filter: text("audience_filter", { mode: "json" }).$type<Record<string, unknown>>().default({}),
    status: text("status").notNull().default("draft"), // draft|scheduled|sending|sent|failed
    scheduled_at: text("scheduled_at"),
    sent_count: integer("sent_count").notNull().default(0),
    created_at: timestamps.created_at,
  },
  (t) => [index("broadcast_campaigns_tenant_idx").on(t.tenant_id)]
);

export const socialPosts = sqliteTable(
  "social_posts",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    platform: text("platform").notNull(), // instagram|facebook|tiktok
    content: text("content").notNull(),
    media_r2_key: text("media_r2_key"),
    status: text("status").notNull().default("scheduled"), // scheduled|posted|failed
    scheduled_at: text("scheduled_at"),
    posted_at: text("posted_at"),
    created_at: timestamps.created_at,
  },
  (t) => [index("social_posts_tenant_idx").on(t.tenant_id)]
);

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const dailyStats = sqliteTable(
  "daily_stats",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    stat_date: text("stat_date").notNull(), // YYYY-MM-DD
    messages_in: integer("messages_in").notNull().default(0),
    messages_out: integer("messages_out").notNull().default(0),
    new_contacts: integer("new_contacts").notNull().default(0),
    new_leads: integer("new_leads").notNull().default(0),
    bookings_created: integer("bookings_created").notNull().default(0),
    bookings_completed: integer("bookings_completed").notNull().default(0),
    revenue_collected: real("revenue_collected").notNull().default(0),
    avg_response_seconds: real("avg_response_seconds"),
    created_at: timestamps.created_at,
  },
  (t) => [uniqueIndex("daily_stats_tenant_date_idx").on(t.tenant_id, t.stat_date)]
);

// ---------------------------------------------------------------------------
// Tasks & reminders
// ---------------------------------------------------------------------------

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    booking_id: text("booking_id"), // nullable — general tasks aren't tied to a job
    assigned_staff_id: text("assigned_staff_id"),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull().default("general"), // job_reminder|follow_up|general|staff_assignment
    due_at: text("due_at"),
    status: text("status").notNull().default("pending"), // pending|done
    created_at: timestamps.created_at,
  },
  (t) => [index("tasks_tenant_idx").on(t.tenant_id), index("tasks_tenant_status_idx").on(t.tenant_id, t.status)]
);

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export const referrals = sqliteTable(
  "referrals",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    referring_customer_id: text("referring_customer_id").notNull(),
    referred_name: text("referred_name"),
    referred_phone: text("referred_phone"),
    referred_customer_id: text("referred_customer_id"), // set once the referral actually books
    reward_status: text("reward_status").notNull().default("pending"), // pending|granted
    reward_description: text("reward_description"),
    created_at: timestamps.created_at,
  },
  (t) => [index("referrals_tenant_idx").on(t.tenant_id)]
);

// ---------------------------------------------------------------------------
// Accounting: vendor bills (accounts payable — separate from the per-job
// `expenses` table, which tracks job-level material/wage cost)
// ---------------------------------------------------------------------------

export const vendorBills = sqliteTable(
  "vendor_bills",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    vendor_name: text("vendor_name").notNull(),
    description: text("description"),
    amount: real("amount").notNull(),
    due_date: text("due_date"),
    status: text("status").notNull().default("unpaid"), // unpaid|paid
    paid_at: text("paid_at"),
    created_at: timestamps.created_at,
  },
  (t) => [index("vendor_bills_tenant_idx").on(t.tenant_id)]
);

// ---------------------------------------------------------------------------
// Calendar sync (Google Calendar / Cal.com) — per staff member. OAuth
// exchange itself needs real provider app credentials this environment
// can't provision; see routes/calendar-sync.ts for what's stubbed.
// ---------------------------------------------------------------------------

export const calendarConnections = sqliteTable(
  "calendar_connections",
  {
    id: id(),
    tenant_id: text("tenant_id").notNull(),
    staff_id: text("staff_id").notNull(),
    provider: text("provider").notNull(), // google|cal_com
    access_token: text("access_token"),
    refresh_token: text("refresh_token"),
    external_calendar_id: text("external_calendar_id"),
    connected_at: text("connected_at"),
    created_at: timestamps.created_at,
  },
  (t) => [index("calendar_connections_tenant_idx").on(t.tenant_id), uniqueIndex("calendar_connections_staff_provider_idx").on(t.staff_id, t.provider)]
);
