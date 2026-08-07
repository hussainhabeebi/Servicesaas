-- ServiceOS initial schema
-- Every tenant-scoped table carries tenant_id; app-layer middleware injects/filters on it.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  business_name TEXT NOT NULL,
  vertical TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter','growth')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  currency TEXT NOT NULL DEFAULT 'AED',
  vat_rate REAL NOT NULL DEFAULT 0.05,
  subdomain TEXT NOT NULL,
  custom_domain TEXT,
  bot_persona_name TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX tenants_slug_idx ON tenants(slug);
CREATE UNIQUE INDEX tenants_subdomain_idx ON tenants(subdomain);

CREATE TABLE tenant_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX tenant_users_tenant_idx ON tenant_users(tenant_id);
CREATE UNIQUE INDEX tenant_users_tenant_email_idx ON tenant_users(tenant_id, email);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  tenant_user_id TEXT NOT NULL REFERENCES tenant_users(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(tenant_user_id);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  tags TEXT DEFAULT '[]',
  preferences TEXT DEFAULT '{}',
  is_repeat_customer INTEGER NOT NULL DEFAULT 0,
  has_active_contract INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX customers_tenant_idx ON customers(tenant_id);
CREATE UNIQUE INDEX customers_tenant_phone_idx ON customers(tenant_id, phone);

CREATE TABLE customer_addresses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  label TEXT NOT NULL DEFAULT 'Home',
  address_line TEXT NOT NULL,
  area TEXT,
  city TEXT,
  lat REAL,
  lng REAL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX customer_addresses_customer_idx ON customer_addresses(customer_id);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'technician',
  color TEXT NOT NULL DEFAULT '#4F46E5',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX staff_tenant_idx ON staff(tenant_id);

CREATE TABLE staff_availability (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  staff_id TEXT NOT NULL REFERENCES staff(id),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);
CREATE INDEX staff_availability_staff_idx ON staff_availability(staff_id);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  category TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price REAL NOT NULL DEFAULT 0,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  recurrence_options TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX services_tenant_idx ON services(tenant_id);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  staff_id TEXT REFERENCES staff(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  address_id TEXT REFERENCES customer_addresses(id),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','en_route','in_progress','completed','cancelled')),
  scheduled_start TEXT NOT NULL,
  scheduled_end TEXT NOT NULL,
  recurrence_rule TEXT CHECK (recurrence_rule IS NULL OR recurrence_rule IN ('weekly','biweekly','monthly')),
  parent_booking_id TEXT REFERENCES bookings(id),
  source TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','whatsapp','website')),
  checkin_at TEXT,
  checkin_lat REAL,
  checkin_lng REAL,
  checkout_at TEXT,
  checkout_lat REAL,
  checkout_lng REAL,
  cancellation_reason TEXT,
  cancellation_fee REAL,
  no_show_risk_score REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX bookings_tenant_idx ON bookings(tenant_id);
CREATE INDEX bookings_staff_time_idx ON bookings(staff_id, scheduled_start);
CREATE INDEX bookings_customer_idx ON bookings(customer_id);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  booking_id TEXT REFERENCES bookings(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','partial','overdue','cancelled')),
  subtotal REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AED',
  due_date TEXT,
  pdf_r2_key TEXT,
  sent_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX invoices_tenant_idx ON invoices(tenant_id);
CREATE UNIQUE INDEX invoices_tenant_number_idx ON invoices(tenant_id, invoice_number);

CREATE TABLE invoice_line_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  kind TEXT NOT NULL DEFAULT 'labor' CHECK (kind IN ('labor','materials','addon')),
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0
);
CREATE INDEX invoice_line_items_invoice_idx ON invoice_line_items(invoice_id);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  method TEXT NOT NULL CHECK (method IN ('cash','card','bank_transfer','payment_link')),
  gateway TEXT CHECK (gateway IS NULL OR gateway IN ('razorpay','phonepe','telr','network_international')),
  gateway_ref TEXT,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','refunded')),
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX payments_invoice_idx ON payments(invoice_id);
CREATE INDEX payments_tenant_idx ON payments(tenant_id);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  booking_id TEXT REFERENCES bookings(id),
  kind TEXT NOT NULL DEFAULT 'materials' CHECK (kind IN ('materials','wages','other')),
  description TEXT,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX expenses_tenant_idx ON expenses(tenant_id);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_name TEXT,
  phone TEXT NOT NULL,
  service_interest TEXT,
  area TEXT,
  mood TEXT NOT NULL DEFAULT 'neutral' CHECK (mood IN ('hot','warm','neutral','cold')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','quoted','booked','closed')),
  source TEXT NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp','website','ads','manual')),
  notes TEXT,
  converted_booking_id TEXT REFERENCES bookings(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX leads_tenant_idx ON leads(tenant_id);
CREATE INDEX leads_tenant_status_idx ON leads(tenant_id, status);

CREATE TABLE wa_phone_mapping (
  phone_number_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  waba_id TEXT,
  display_phone TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE whatsapp_conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  customer_phone TEXT NOT NULL,
  contact_id TEXT REFERENCES customers(id),
  last_message_at TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX wa_conversations_tenant_idx ON whatsapp_conversations(tenant_id);
CREATE UNIQUE INDEX wa_conversations_tenant_phone_idx ON whatsapp_conversations(tenant_id, customer_phone);

CREATE TABLE whatsapp_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  conversation_id TEXT NOT NULL REFERENCES whatsapp_conversations(id),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','audio','template','interactive')),
  body TEXT,
  media_r2_key TEXT,
  wa_message_id TEXT,
  status TEXT DEFAULT 'sent',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX wa_messages_conversation_idx ON whatsapp_messages(conversation_id);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  booking_id TEXT REFERENCES bookings(id),
  customer_id TEXT REFERENCES customers(id),
  rating INTEGER,
  comment TEXT,
  google_review_clicked INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX reviews_tenant_idx ON reviews(tenant_id);

CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  domain TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'subdomain' CHECK (type IN ('subdomain','custom')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verifying','active','error')),
  cf_hostname_id TEXT,
  ssl_status TEXT,
  dns_records TEXT,
  error_message TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX domains_tenant_idx ON domains(tenant_id);
CREATE UNIQUE INDEX domains_domain_idx ON domains(domain);

CREATE TABLE sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  template_key TEXT NOT NULL DEFAULT 'generic',
  draft_content TEXT DEFAULT '{}',
  live_content TEXT,
  sections_enabled TEXT DEFAULT '["gallery","testimonials","pricing","service_area_map"]',
  languages TEXT DEFAULT '["en"]',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX sites_tenant_idx ON sites(tenant_id);

CREATE TABLE site_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  site_id TEXT NOT NULL REFERENCES sites(id),
  content TEXT NOT NULL,
  published_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX site_versions_site_idx ON site_versions(site_id);

CREATE TABLE ad_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  service_id TEXT REFERENCES services(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','ended')),
  daily_budget REAL,
  radius_km REAL DEFAULT 10,
  center_lat REAL,
  center_lng REAL,
  google_campaign_id TEXT,
  call_tracking_number TEXT,
  spend REAL NOT NULL DEFAULT 0,
  bookings_attributed INTEGER NOT NULL DEFAULT 0,
  revenue_attributed REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ad_campaigns_tenant_idx ON ad_campaigns(tenant_id);

CREATE TABLE broadcast_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  audience_filter TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','failed')),
  scheduled_at TEXT,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX broadcast_campaigns_tenant_idx ON broadcast_campaigns(tenant_id);

CREATE TABLE social_posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  platform TEXT NOT NULL CHECK (platform IN ('instagram','facebook','tiktok')),
  content TEXT NOT NULL,
  media_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','posted','failed')),
  scheduled_at TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX social_posts_tenant_idx ON social_posts(tenant_id);

CREATE TABLE daily_stats (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  stat_date TEXT NOT NULL,
  messages_in INTEGER NOT NULL DEFAULT 0,
  messages_out INTEGER NOT NULL DEFAULT 0,
  new_contacts INTEGER NOT NULL DEFAULT 0,
  new_leads INTEGER NOT NULL DEFAULT 0,
  bookings_created INTEGER NOT NULL DEFAULT 0,
  bookings_completed INTEGER NOT NULL DEFAULT 0,
  revenue_collected REAL NOT NULL DEFAULT 0,
  avg_response_seconds REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX daily_stats_tenant_date_idx ON daily_stats(tenant_id, stat_date);
