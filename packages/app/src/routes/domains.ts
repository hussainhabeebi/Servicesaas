import { Hono } from "hono";
import { z } from "zod";
import { createDb } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { listDomains, addDomain, addManualDomain, markManualDomainActive, checkDomain } from "../lib/domain-management";

export const domainsRoute = new Hono<AppContext>();

domainsRoute.get("/", async (c) => {
  const domains = await listDomains(createDb(c.env.DB), c.get("tenantId"));
  return c.json({ domains });
});

const addSchema = z.object({ domain: z.string().min(3) });

domainsRoute.post("/", async (c) => {
  const parsed = addSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = await addDomain(c.env, c.get("tenantId"), parsed.data.domain);
  if ("error" in result) return c.json(result, 400);
  return c.json(result, 201);
});

/** Free path: tenant moves the domain's nameservers to Cloudflare themselves — see lib/domain-management.ts. */
domainsRoute.post("/manual", async (c) => {
  const parsed = addSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const result = await addManualDomain(c.env, c.get("tenantId"), parsed.data.domain);
  if ("error" in result) return c.json(result, 400);
  return c.json(result, 201);
});

domainsRoute.post("/:id/activate", async (c) => {
  const result = await markManualDomainActive(createDb(c.env.DB), c.get("tenantId"), c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});

/** Scheduled domain health check (spec §7) — also callable on-demand from the tenant's domain status page. */
domainsRoute.post("/:id/check", async (c) => {
  const result = await checkDomain(c.env, c.get("tenantId"), c.req.param("id"));
  if (!result) return c.json({ error: "Not found" }, 404);
  return c.json(result);
});
