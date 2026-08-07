import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createDb, schema, hashPassword, signAccessToken } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { slugify } from "../lib/slug";
import { VERTICAL_DEFAULT_SERVICES, isVertical } from "../templates/vertical-defaults";

/**
 * Self-serve onboarding wizard (spec §11): business type -> services ->
 * pricing -> staff count -> done. One call provisions the tenant row,
 * subdomain, default services, default staff, and a blank site draft — no
 * manual ops involvement, matching the "auto-provisioning" platform goal.
 */
export const onboardingRoute = new Hono<AppContext>();

const signupSchema = z.object({
  businessName: z.string().min(2).max(120),
  vertical: z.string(),
  ownerName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(6),
  password: z.string().min(8),
  staffCount: z.number().int().min(1).max(200).default(1),
  locale: z.enum(["en", "ar"]).default("en"),
});

onboardingRoute.post("/signup", async (c) => {
  const parsed = signupSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const input = parsed.data;
  const vertical = isVertical(input.vertical) ? input.vertical : "generic";

  const db = createDb(c.env.DB);
  const baseSlug = slugify(input.businessName) || "business";
  let slug = baseSlug;
  for (let attempt = 0; attempt < 20; attempt++) {
    const [existing] = await db.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${baseSlug}-${Math.floor(Math.random() * 9000 + 1000)}`;
  }
  const subdomain = `${slug}.${c.env.ROOT_DOMAIN}`;

  const tenantId = crypto.randomUUID();
  const plan = input.staffCount > 1 ? "starter" : "starter"; // plan is chosen/upgraded separately; default Starter on signup

  await db.insert(schema.tenants).values({
    id: tenantId,
    slug,
    business_name: input.businessName,
    vertical,
    plan,
    locale: input.locale,
    subdomain,
  });

  const passwordHash = await hashPassword(input.password);
  const ownerId = crypto.randomUUID();
  await db.insert(schema.tenantUsers).values({
    id: ownerId,
    tenant_id: tenantId,
    name: input.ownerName,
    email: input.email,
    phone: input.phone,
    password_hash: passwordHash,
    role: "owner",
  });

  const defaultServices = VERTICAL_DEFAULT_SERVICES[vertical];
  if (defaultServices.length > 0) {
    await db.insert(schema.services).values(
      defaultServices.map((s) => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: s.name,
        category: s.category,
        duration_minutes: s.duration_minutes,
        price: s.price,
      }))
    );
  }

  if (input.staffCount > 1) {
    await db.insert(schema.staff).values(
      Array.from({ length: input.staffCount }, (_, i) => ({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        name: `Staff ${i + 1}`,
      }))
    );
  }

  await db.insert(schema.sites).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    template_key: vertical,
    draft_content: {
      businessName: input.businessName,
      heroText: `Book ${input.businessName} in minutes`,
      hours: "Mon-Sat 9am-7pm",
      languages: [input.locale],
    },
    languages: [input.locale],
  });

  await db.insert(schema.domains).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    domain: subdomain,
    type: "subdomain",
    status: "active", // subdomain is always active immediately, no DNS/SSL wait needed
  });

  const token = await signAccessToken({ sub: ownerId, tenant_id: tenantId, role: "owner" }, c.env.JWT_SECRET);

  return c.json(
    {
      tenant: { id: tenantId, slug, subdomain, vertical, plan },
      user: { id: ownerId, name: input.ownerName, role: "owner" },
      accessToken: token,
    },
    201
  );
});
