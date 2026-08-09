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

interface CfZone {
  id: string;
  status: string; // pending | active | ...
  name_servers: string[];
}

interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
}

interface CfApiResponse<T> {
  success: boolean;
  result?: T;
  errors?: Array<{ code: number; message: string }>;
}

type CfResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Generic Cloudflare v4 API caller — surfaces the actual error text (permission, plan, zone mismatch, etc.) instead of a generic guess, since that's what shows up in the domains UI when something's wrong. */
async function cfCall<T>(env: Env, path: string, init?: RequestInit): Promise<CfResult<T>> {
  if (!env.CF_API_TOKEN) return { ok: false, error: "CF_API_TOKEN is not configured on this environment" };
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json", ...init?.headers },
  });
  const json = (await res.json().catch(() => null)) as CfApiResponse<T> | null;
  if (!res.ok || !json?.success || json.result === undefined) {
    const detail = json?.errors?.map((e) => `${e.message} (${e.code})`).join("; ") ?? `HTTP ${res.status}`;
    return { ok: false, error: `Cloudflare: ${detail}` };
  }
  return { ok: true, value: json.result };
}

async function cfCreateCustomHostname(env: Env, hostname: string): Promise<CfResult<CfCustomHostname>> {
  if (!env.CF_ZONE_ID) return { ok: false, error: "CF_ZONE_ID is not configured on this environment" };
  return cfCall<CfCustomHostname>(env, `/zones/${env.CF_ZONE_ID}/custom_hostnames`, {
    method: "POST",
    body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv" } }),
  });
}

async function cfGetCustomHostname(env: Env, cfHostnameId: string): Promise<CfResult<CfCustomHostname>> {
  if (!env.CF_ZONE_ID) return { ok: false, error: "CF_ZONE_ID is not configured on this environment" };
  return cfCall<CfCustomHostname>(env, `/zones/${env.CF_ZONE_ID}/custom_hostnames/${cfHostnameId}`);
}

/**
 * Full-zone mode: instead of the tenant adding a CNAME at their existing DNS
 * provider, they delegate the domain's nameservers to Cloudflare and it
 * becomes a real zone we control — Cloudflare terminates SSL and edge-routes
 * it directly (Universal SSL) rather than going through the custom_hostnames
 * validation dance. Needs Zone:Edit + DNS:Edit permission on CF_API_TOKEN.
 */
async function cfCreateZone(env: Env, domain: string): Promise<CfResult<CfZone>> {
  if (!env.CF_ACCOUNT_ID) return { ok: false, error: "CF_ACCOUNT_ID is not configured on this environment" };
  return cfCall<CfZone>(env, `/zones`, {
    method: "POST",
    body: JSON.stringify({ name: domain, account: { id: env.CF_ACCOUNT_ID }, type: "full" }),
  });
}

async function cfGetZone(env: Env, zoneId: string): Promise<CfResult<CfZone>> {
  return cfCall<CfZone>(env, `/zones/${zoneId}`);
}

async function cfListDnsRecords(env: Env, zoneId: string): Promise<CfResult<CfDnsRecord[]>> {
  return cfCall<CfDnsRecord[]>(env, `/zones/${zoneId}/dns_records?per_page=100`);
}

async function cfCreateDnsRecord(env: Env, zoneId: string, name: string, content: string): Promise<CfResult<CfDnsRecord>> {
  return cfCall<CfDnsRecord>(env, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: "CNAME", name, content, proxied: true }),
  });
}

/**
 * Once a delegated zone goes active on Cloudflare's side, point it at the
 * same fallback origin the CNAME flow uses (`hosted.{ROOT_DOMAIN}`, itself a
 * proxied hostname on our own zone routed to site-engine) — Cloudflare
 * chains the proxied CNAME (orange-to-orange) and preserves the original
 * Host header, so tenantResolutionMiddleware's custom-domain lookup still
 * matches on the tenant's own hostname. Idempotent: skips records that
 * already exist so repeated status checks don't duplicate them.
 */
async function ensureZoneDnsRecords(env: Env, zoneId: string, domain: string): Promise<CfResult<true>> {
  const existing = await cfListDnsRecords(env, zoneId);
  if (!existing.ok) return existing;
  const have = new Set(existing.value.filter((r) => r.type === "CNAME").map((r) => r.name));
  const target = `hosted.${env.ROOT_DOMAIN}`;
  for (const name of [domain, `www.${domain}`]) {
    if (have.has(name)) continue;
    const created = await cfCreateDnsRecord(env, zoneId, name, target);
    if (!created.ok) return created;
  }
  return { ok: true, value: true };
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

export type DomainMode = "cname" | "zone";

export async function addDomain(env: Env, tenantId: string, rawDomain: string, mode: DomainMode = "cname") {
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

  const id = existing?.id ?? crypto.randomUUID();

  if (mode === "zone") {
    const cf = await cfCreateZone(env, domain);
    const values = {
      tenant_id: tenantId,
      domain,
      type: "zone" as const,
      status: cf.ok ? ("pending" as const) : ("error" as const),
      cf_zone_id: cf.ok ? cf.value.id : undefined,
      name_servers: cf.ok ? cf.value.name_servers : undefined,
      dns_records: undefined,
      error_message: cf.ok ? undefined : cf.error,
      last_checked_at: new Date().toISOString(),
    };
    if (existing) {
      await db.update(schema.domains).set(values).where(eq(schema.domains.id, existing.id));
    } else {
      await db.insert(schema.domains).values({ id, ...values });
    }
    return { id, status: values.status, dnsRecords: [], nameServers: values.name_servers ?? [] };
  }

  const cf = await cfCreateCustomHostname(env, domain);
  const dnsRecords = cf.ok ? toDnsRecords(cf.value, domain, env.ROOT_DOMAIN) : [];
  const values = {
    tenant_id: tenantId,
    domain,
    type: "custom" as const,
    status: cf.ok ? ("verifying" as const) : ("error" as const),
    cf_hostname_id: cf.ok ? cf.value.id : undefined,
    ssl_status: cf.ok ? cf.value.ssl.status : undefined,
    dns_records: cf.ok ? dnsRecords : undefined,
    error_message: cf.ok ? undefined : cf.error,
    last_checked_at: new Date().toISOString(),
  };
  if (existing) {
    await db.update(schema.domains).set(values).where(eq(schema.domains.id, existing.id));
  } else {
    await db.insert(schema.domains).values({ id, ...values });
  }
  return { id, status: values.status, dnsRecords, nameServers: [] as string[] };
}

async function checkZoneDomain(env: Env, db: ReturnType<typeof createDb>, domain: typeof schema.domains.$inferSelect) {
  if (!domain.cf_zone_id) return { status: "error" as const };

  const zone = await cfGetZone(env, domain.cf_zone_id);
  if (!zone.ok) {
    await db.update(schema.domains).set({ status: "error", error_message: zone.error, last_checked_at: new Date().toISOString() }).where(eq(schema.domains.id, domain.id));
    return { status: "error" as const };
  }

  if (zone.value.status !== "active") {
    // Nameservers haven't propagated to Cloudflare yet — nothing more to do until they do.
    await db
      .update(schema.domains)
      .set({ status: "pending", name_servers: zone.value.name_servers, last_checked_at: new Date().toISOString(), error_message: undefined })
      .where(eq(schema.domains.id, domain.id));
    return { status: "pending" as const };
  }

  const dns = await ensureZoneDnsRecords(env, domain.cf_zone_id, domain.domain);
  if (!dns.ok) {
    await db.update(schema.domains).set({ status: "error", error_message: dns.error, last_checked_at: new Date().toISOString() }).where(eq(schema.domains.id, domain.id));
    return { status: "error" as const };
  }

  await db
    .update(schema.domains)
    .set({ status: "active", ssl_status: "active", name_servers: zone.value.name_servers, last_checked_at: new Date().toISOString(), error_message: undefined })
    .where(eq(schema.domains.id, domain.id));
  return { status: "active" as const, sslStatus: "active" as const };
}

export async function checkDomain(env: Env, tenantId: string, domainId: string) {
  const db = createDb(env.DB);
  const [domain] = await db.select().from(schema.domains).where(and(eq(schema.domains.id, domainId), eq(schema.domains.tenant_id, tenantId))).limit(1);
  if (!domain) return null;

  if (domain.type === "zone") return checkZoneDomain(env, db, domain);
  if (!domain.cf_hostname_id) return { status: "error" as const };

  const cf = await cfGetCustomHostname(env, domain.cf_hostname_id);
  if (!cf.ok) {
    await db.update(schema.domains).set({ status: "error", error_message: cf.error, last_checked_at: new Date().toISOString() }).where(eq(schema.domains.id, domain.id));
    return { status: "error" as const };
  }

  const status = cf.value.status === "active" && cf.value.ssl.status === "active" ? "active" : "verifying";
  await db
    .update(schema.domains)
    .set({ status, ssl_status: cf.value.ssl.status, dns_records: toDnsRecords(cf.value, domain.domain, env.ROOT_DOMAIN), last_checked_at: new Date().toISOString(), error_message: undefined })
    .where(eq(schema.domains.id, domain.id));

  return { status, sslStatus: cf.value.ssl.status };
}
