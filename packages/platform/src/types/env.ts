/**
 * Shared Cloudflare Worker bindings, consumed by /app and /site-engine.
 * Each Worker's wrangler.toml declares these; the interface just types them.
 */
export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  BOOKING_CALENDAR: DurableObjectNamespace;
  AI?: Ai;

  // Secrets
  JWT_SECRET: string;
  CHATWOOT_API_TOKEN: string; // platform agent token, sends on behalf of any tenant's inbox
  CHATWOOT_WEBHOOK_TOKEN: string; // shared secret embedded in the Chatwoot webhook URL
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
  ADMIN_API_TOKEN: string; // bearer token guarding /admin/* internal ops routes

  // Vars
  ENVIRONMENT: "staging" | "production";
  ROOT_DOMAIN: string; // e.g. "yourapp.com" — subdomains are {slug}.yourapp.com
  CHATWOOT_BASE_URL: string; // e.g. "https://app.aiingo.com" — no trailing slash
  CHATWOOT_ACCOUNT_ID: string;
}

export interface AppContext {
  Bindings: Env;
  Variables: {
    tenantId: string;
    tenantUserId?: string;
    tenantRole?: "owner" | "staff" | "admin";
  };
}
