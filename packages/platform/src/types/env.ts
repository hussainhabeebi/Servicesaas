/**
 * Shared Cloudflare Worker bindings, consumed by /app and /site-engine.
 * Each Worker's wrangler.toml declares these; the interface just types them.
 */
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  BOOKING_CALENDAR: DurableObjectNamespace;

  // Secrets
  JWT_SECRET: string;
  CHATWOOT_PLATFORM_API_TOKEN: string; // Super Admin token — creates a Chatwoot Account per tenant, nothing else
  CHATWOOT_AGENT_BOT_TOKEN: string; // one token, added to every tenant's account, used for all messaging
  CHATWOOT_WEBHOOK_TOKEN: string; // shared secret embedded in the Chatwoot webhook URL
  GEMINI_API_KEY: string; // powers conversation understanding, voice transcription, and photo-based quoting
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  PHONEPE_MERCHANT_ID?: string;
  PHONEPE_SALT_KEY?: string;
  TELR_STORE_ID?: string;
  TELR_AUTH_KEY?: string;
  NETWORK_INTL_MERCHANT_ID?: string;
  NETWORK_INTL_API_KEY?: string;
  CF_API_TOKEN?: string; // Cloudflare for SaaS custom hostnames API
  CF_ZONE_ID?: string;
  ADMIN_API_TOKEN: string; // bootstrap-only now — provisions the first admin_users account (routes/admin-bootstrap.ts), not day-to-day /admin/* access
  VAPID_PRIVATE_KEY?: string; // Web Push (lib/webpush.ts) — base64url raw P-256 private key scalar, `openssl` or `web-push generate-vapid-keys` can generate a pair
  VAPID_PUBLIC_KEY?: string; // base64url uncompressed P-256 public key (0x04 || x || y) — also served to the browser as PushManager's applicationServerKey
  VAPID_SUBJECT?: string; // mailto: or https: contact URL required by RFC 8292

  // Vars
  ENVIRONMENT: "staging" | "production";
  ROOT_DOMAIN: string; // e.g. "yourapp.com" — subdomains are {slug}.yourapp.com
  CHATWOOT_BASE_URL: string; // e.g. "https://app.aiingo.com" — no trailing slash
  CHATWOOT_AGENT_BOT_ID: string; // numeric ID of the platform Agent Bot, as a string — GET /platform/api/v1/agent_bots to find it
  META_APP_ID: string; // public — used by the frontend Embedded Signup widget
  META_EMBEDDED_SIGNUP_CONFIG_ID: string; // public — Meta App's Embedded Signup configuration ID
  GEMINI_MODEL: string; // e.g. "gemini-2.0-flash" — kept configurable since model names change over time
  API_BASE_URL: string; // e.g. "https://api.yourapp.com" — used by site-engine's landing page signup form; app doesn't need it
}

export interface AppContext {
  Bindings: Env;
  Variables: {
    tenantId: string;
    tenantUserId?: string;
    tenantRole?: "owner" | "staff" | "admin";
    staffId?: string; // set when the logged-in tenant_user is linked to a staff/crew record (tenant_users.staff_id)
    adminUserId?: string;
  };
}
