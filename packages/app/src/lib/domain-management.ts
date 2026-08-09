import { and, eq } from "drizzle-orm";
import { createDb, schema, type Env } from "@serviceos/platform";

/**
 * Custom domain flow (Growth tier, spec §7) — extracted from routes/domains.ts
 * so both the tenant's own dashboard (self-serve) and the admin panel
 * (support override) call the exact same Cloudflare for SaaS logic, just
 * with a different source for tenantId (JWT vs a route param).
 */

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Cloudflare's custom_hostnames API wants a bare hostname — people paste
 * full URLs ("https://www.example.com/") more often than not, so strip
 * scheme/path/trailing dot before validating rather than rejecting those
 * outright.
 */
export function normalizeHostname(input: string): string | null {
  let h = input.trim().toLowerCase();
  h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip scheme
  h = h.split(/[/?#]/)[0] ?? ""; // strip path/query/fragment
  h = h.replace(/\.$/, ""); // strip trailing dot
  return HOSTNAME_RE.test(h) ? h : null;
}

interface CfCustomHostname {
  id: string;
  status: string; // pending | active | ...
  ssl: { status: string; validation_records?: Array<{ txt_name?: string; txt_value?: string; cname_target?: string; cname?: string }> };
  ownership_verification?: { type: string; name: string; value: string };
}

interface CfApiResponse {
  success: boolean;
  result?: CfCustomHostname;
  errors?: Array<{ code: number; message: string }>;
}

type CfResult = { ok: true; hostname: CfCustomHostname } | { ok: false; error: string };

/** Surfaces Cloudflare's actual error text (permission, plan, zone mismatch, etc.) instead of a generic guess — this is what actually shows up in the domains UI when something's wrong. */
async function cfCreateCustomHostname(env: Env, hostname: string): Promise<CfResult> {
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return { ok: false, error: "CF_API_TOKEN/CF_ZONE_ID are not configured on this environment" };
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv" } }),
  });
  const json = (await res.json().catch(() => null)) as CfApiResponse | null;
  if (!res.ok || !json?.success || !json.result) {
    const detail = json?.errors?.map((e) => `${e.message} (${e.code})`).join("; ") ?? `HTTP ${res.status}`;
    return { ok: false, error: `Cloudflare: ${detail}` };
  }
  return { ok: true, hostname: json.result };
}

async function cfGetCustomHostname(env: Env, cfHostnameId: string): Promise<CfResult> {
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return { ok: false, error: "CF_API_TOKEN/CF_ZONE_ID are not configured on this environment" };
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames/${cfHostnameId}`, {
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
  });
  const json = (await res.json().catch(() => null)) as CfApiResponse | null;
  if (!res.ok || !json?.success || !json.result) {
    const detail = json?.errors?.map((e) => `${e.message} (${e.code})`).join("; ") ?? `HTTP ${res.status}`;
    return { ok: false, error: `Cloudflare: ${detail}` };
  }
  return { ok: true, hostname: json.result };
}

function toDnsRecords(cf: CfCustomHostname, hostname: string, rootDomain: string) {
  // The fallback-origin hostname configured in Cloudflare for SaaS (Custom Hostname Fallback origin)
  // must itself be a proxied hostname on our own zone, routed to site-engine.
  const records: Array<{ type: string; name: string; value: string }> = [{ type: "CNAME", name: hostname, value: `hosted.${rootDomain}` }];
  if (cf.ownership_verification) {
    records.push({ type: "TXT", name: cf.ownership_verification.name, value: cf.ownership_verification.value });
  }
  for (const v of cf.ssl.validation_records ?? []) {
    if (v.txt_name && v.txt_value) records.push({ type: "TXT", name: v.txt_name, value: v.txt_value });
    if (v.cname && v.cname_target) records.push({ type: "CNAME", name: v.cname, value: v.cname_target });
  }
  return records;
}

export async function listDomains(db: ReturnType<typeof createDb>, tenantId: string) {
  return db.select().from(schema.domains).where(eq(schema.domains.tenant_id, tenantId));
}

export async function addDomain(env: Env, tenantId: string, rawDomain: string) {
  const domain = normalizeHostname(rawDomain);
  if (!domain) {
    return { error: "Not a valid domain — enter just the hostname, e.g. yourbusiness.com (no https:// or trailing slash)" as const };
  }

  const db = createDb(env.DB);

  // domains.domain is globally unique, so a bare INSERT would throw a raw
  // DB error on retry after a failed attempt (e.g. Cloudflare secrets
  // weren't configured yet the first time). Same tenant retrying their own
  // domain re-registers in place; a different tenant claiming an
  // already-connected domain is a genuine conflict.
  const [existing] = await db.select().from(schema.domains).where(eq(schema.domains.domain, domain)).limit(1);
  if (existing && existing.tenant_id !== tenantId) {
    return { error: "This domain is already connected to another account" as const };
  }

  const cf = await cfCreateCustomHostname(env, domain);
  const id = existing?.id ?? crypto.randomUUID();
  const dnsRecords = cf.ok ? toDnsRecords(cf.hostname, domain, env.ROOT_DOMAIN) : [];
  const values = {
    tenant_id: tenantId,
    domain,
    type: "custom" as const,
    status: cf.ok ? ("verifying" as const) : ("error" as const),
    cf_hostname_id: cf.ok ? cf.hostname.id : undefined,
    ssl_status: cf.ok ? cf.hostname.ssl.status : undefined,
    dns_records: cf.ok ? dnsRecords : undefined,
    error_message: cf.ok ? undefined : cf.error,
    last_checked_at: new Date().toISOString(),
  };
  if (existing) {
    await db.update(schema.domains).set(values).where(eq(schema.domains.id, existing.id));
  } else {
    await db.insert(schema.domains).values({ id, ...values });
  }
  return { id, status: values.status, dnsRecords };
}

export async function checkDomain(env: Env, tenantId: string, domainId: string) {
  const db = createDb(env.DB);
  const [domain] = await db.select().from(schema.domains).where(and(eq(schema.domains.id, domainId), eq(schema.domains.tenant_id, tenantId))).limit(1);
  if (!domain) return null;
  if (!domain.cf_hostname_id) return { status: "error" as const };

  const cf = await cfGetCustomHostname(env, domain.cf_hostname_id);
  if (!cf.ok) {
    await db.update(schema.domains).set({ status: "error", error_message: cf.error, last_checked_at: new Date().toISOString() }).where(eq(schema.domains.id, domain.id));
    return { status: "error" as const };
  }

  const status = cf.hostname.status === "active" && cf.hostname.ssl.status === "active" ? "active" : "verifying";
  await db
    .update(schema.domains)
    .set({ status, ssl_status: cf.hostname.ssl.status, dns_records: toDnsRecords(cf.hostname, domain.domain, env.ROOT_DOMAIN), last_checked_at: new Date().toISOString(), error_message: undefined })
    .where(eq(schema.domains.id, domain.id));

  return { status, sslStatus: cf.hostname.ssl.status };
}
