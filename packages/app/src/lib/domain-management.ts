import { and, eq } from "drizzle-orm";
import { createDb, schema, type Env } from "@serviceos/platform";

/**
 * Custom domain flow (Growth tier, spec §7) — extracted from routes/domains.ts
 * so both the tenant's own dashboard (self-serve) and the admin panel
 * (support override) call the exact same Cloudflare for SaaS logic, just
 * with a different source for tenantId (JWT vs a route param).
 */

interface CfCustomHostname {
  id: string;
  status: string; // pending | active | ...
  ssl: { status: string; validation_records?: Array<{ txt_name?: string; txt_value?: string; cname_target?: string; cname?: string }> };
  ownership_verification?: { type: string; name: string; value: string };
}

async function cfCreateCustomHostname(env: Env, hostname: string): Promise<CfCustomHostname | null> {
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return null;
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ hostname, ssl: { method: "http", type: "dv" } }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result: CfCustomHostname };
  return json.result;
}

async function cfGetCustomHostname(env: Env, cfHostnameId: string): Promise<CfCustomHostname | null> {
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) return null;
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/custom_hostnames/${cfHostnameId}`, {
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result: CfCustomHostname };
  return json.result;
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

export async function addDomain(env: Env, tenantId: string, domain: string) {
  const db = createDb(env.DB);
  const cf = await cfCreateCustomHostname(env, domain);
  const id = crypto.randomUUID();
  const dnsRecords = cf ? toDnsRecords(cf, domain, env.ROOT_DOMAIN) : [];
  await db.insert(schema.domains).values({
    id,
    tenant_id: tenantId,
    domain,
    type: "custom",
    status: cf ? "verifying" : "error",
    cf_hostname_id: cf?.id,
    ssl_status: cf?.ssl.status,
    dns_records: cf ? dnsRecords : undefined,
    error_message: cf ? undefined : "Could not register domain with Cloudflare — check CF_API_TOKEN/CF_ZONE_ID config",
    last_checked_at: new Date().toISOString(),
  });
  return { id, status: cf ? ("verifying" as const) : ("error" as const), dnsRecords };
}

export async function checkDomain(env: Env, tenantId: string, domainId: string) {
  const db = createDb(env.DB);
  const [domain] = await db.select().from(schema.domains).where(and(eq(schema.domains.id, domainId), eq(schema.domains.tenant_id, tenantId))).limit(1);
  if (!domain) return null;
  if (!domain.cf_hostname_id) return { status: "error" as const };

  const cf = await cfGetCustomHostname(env, domain.cf_hostname_id);
  if (!cf) {
    await db.update(schema.domains).set({ status: "error", error_message: "Cloudflare lookup failed", last_checked_at: new Date().toISOString() }).where(eq(schema.domains.id, domain.id));
    return { status: "error" as const };
  }

  const status = cf.status === "active" && cf.ssl.status === "active" ? "active" : "verifying";
  await db
    .update(schema.domains)
    .set({ status, ssl_status: cf.ssl.status, dns_records: toDnsRecords(cf, domain.domain, env.ROOT_DOMAIN), last_checked_at: new Date().toISOString(), error_message: undefined })
    .where(eq(schema.domains.id, domain.id));

  return { status, sslStatus: cf.ssl.status };
}
