import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

/**
 * Custom domain flow (Growth tier, spec §7): tenant enters a domain, we
 * register it as a Cloudflare for SaaS custom hostname, translate the
 * returned verification requirements into plain-language DNS records, and
 * poll status until Cloudflare reports the hostname active (SSL issued).
 * The tenant's subdomain row from onboarding stays untouched as fallback.
 */
export const domainsRoute = new Hono<AppContext>();

interface CfCustomHostname {
  id: string;
  status: string; // pending | active | ...
  ssl: { status: string; validation_records?: Array<{ txt_name?: string; txt_value?: string; cname_target?: string; cname?: string }> };
  ownership_verification?: { type: string; name: string; value: string };
}

async function cfCreateCustomHostname(env: AppContext["Bindings"], hostname: string): Promise<CfCustomHostname | null> {
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

async function cfGetCustomHostname(env: AppContext["Bindings"], cfHostnameId: string): Promise<CfCustomHostname | null> {
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

domainsRoute.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(schema.domains).where(eq(schema.domains.tenant_id, c.get("tenantId")));
  return c.json({ domains: rows });
});

const addSchema = z.object({ domain: z.string().min(3) });

domainsRoute.post("/", async (c) => {
  const parsed = addSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);

  const cf = await cfCreateCustomHostname(c.env, parsed.data.domain);
  const id = crypto.randomUUID();
  await db.insert(schema.domains).values({
    id,
    tenant_id: tenantId,
    domain: parsed.data.domain,
    type: "custom",
    status: cf ? "verifying" : "error",
    cf_hostname_id: cf?.id,
    ssl_status: cf?.ssl.status,
    dns_records: cf ? toDnsRecords(cf, parsed.data.domain, c.env.ROOT_DOMAIN) : undefined,
    error_message: cf ? undefined : "Could not register domain with Cloudflare — check CF_API_TOKEN/CF_ZONE_ID config",
    last_checked_at: new Date().toISOString(),
  });

  return c.json({ id, status: cf ? "verifying" : "error", dnsRecords: cf ? toDnsRecords(cf, parsed.data.domain, c.env.ROOT_DOMAIN) : [] }, 201);
});

/** Scheduled domain health check (spec §7) — also callable on-demand from the tenant's domain status page. */
domainsRoute.post("/:id/check", async (c) => {
  const tenantId = c.get("tenantId");
  const db = createDb(c.env.DB);
  const [domain] = await db.select().from(schema.domains).where(and(eq(schema.domains.id, c.req.param("id")), eq(schema.domains.tenant_id, tenantId))).limit(1);
  if (!domain) return c.json({ error: "Not found" }, 404);
  if (!domain.cf_hostname_id) return c.json({ error: "No Cloudflare hostname to check" }, 400);

  const cf = await cfGetCustomHostname(c.env, domain.cf_hostname_id);
  if (!cf) {
    await db.update(schema.domains).set({ status: "error", error_message: "Cloudflare lookup failed", last_checked_at: new Date().toISOString() }).where(eq(schema.domains.id, domain.id));
    return c.json({ status: "error" });
  }

  const status = cf.status === "active" && cf.ssl.status === "active" ? "active" : cf.status === "active" ? "verifying" : "verifying";
  await db
    .update(schema.domains)
    .set({ status, ssl_status: cf.ssl.status, dns_records: toDnsRecords(cf, domain.domain, c.env.ROOT_DOMAIN), last_checked_at: new Date().toISOString(), error_message: undefined })
    .where(eq(schema.domains.id, domain.id));

  return c.json({ status, sslStatus: cf.ssl.status });
});
