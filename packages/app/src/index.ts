import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppContext } from "@serviceos/platform";
import { tenantResolutionMiddleware, requireAuth } from "@serviceos/platform";

import { onboardingRoute } from "./routes/onboarding";
import { authRoute } from "./routes/auth";
import { servicesRoute } from "./routes/services";
import { staffRoute } from "./routes/staff";
import { customersRoute } from "./routes/customers";
import { bookingsRoute } from "./routes/bookings";
import { invoicesRoute } from "./routes/invoices";
import { paymentsRoute } from "./routes/payments";
import { paymentsWebhookRoute } from "./routes/payments-webhook";
import { leadsRoute } from "./routes/leads";
import { chatwootWebhookRoute } from "./routes/chatwoot-webhook";
import { whatsappConnectRoute } from "./routes/whatsapp-connect";
import { reviewsRoute } from "./routes/reviews";
import { statsRoute } from "./routes/stats";
import { domainsRoute } from "./routes/domains";
import { sitesRoute } from "./routes/sites";
import { adminRoute } from "./routes/admin";
import { publicRoute } from "./routes/public";
import { tasksRoute } from "./routes/tasks";
import { referralsRoute } from "./routes/referrals";
import { vendorBillsRoute } from "./routes/vendor-bills";
import { reportsRoute } from "./routes/reports";
import { broadcastRoute } from "./routes/broadcast";
import { calendarSyncRoute } from "./routes/calendar-sync";
import { billingRoute } from "./routes/billing";
import { teamRoute } from "./routes/team";
import { BookingCalendarDO } from "./durable-objects/booking-calendar";

const app = new Hono<AppContext>();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "serviceos-app", environment: c.env.ENVIRONMENT }));

// --- Platform-level routes: no resolved tenant host, no auth yet -----------
app.route("/onboarding", onboardingRoute);
app.route("/auth", authRoute);
app.route("/webhooks/chatwoot", chatwootWebhookRoute);
app.route("/webhooks/payments", paymentsWebhookRoute);

// --- Public storefront routes: tenant resolved from Host, no login ---------
const publicApp = new Hono<AppContext>();
publicApp.use("*", tenantResolutionMiddleware());
publicApp.route("/", publicRoute);
app.route("/public", publicApp);

// --- Authenticated tenant business routes: tenant resolved from the JWT ----
const api = new Hono<AppContext>();
api.use("*", requireAuth());
api.route("/services", servicesRoute);
api.route("/staff", staffRoute);
api.route("/customers", customersRoute);
api.route("/bookings", bookingsRoute);
api.route("/invoices", invoicesRoute);
api.route("/payments", paymentsRoute);
api.route("/leads", leadsRoute);
api.route("/reviews", reviewsRoute);
api.route("/stats", statsRoute);
api.route("/domains", domainsRoute);
api.route("/sites", sitesRoute);
api.route("/whatsapp", whatsappConnectRoute);
api.route("/tasks", tasksRoute);
api.route("/referrals", referralsRoute);
api.route("/vendor-bills", vendorBillsRoute);
api.route("/reports", reportsRoute);
api.route("/broadcasts", broadcastRoute);
api.route("/calendar-sync", calendarSyncRoute);
api.route("/billing", billingRoute);
api.route("/team", teamRoute);
app.route("/api", api);

// --- Internal ops routes: guarded by a static admin bearer token, not tenant JWTs ---
const admin = new Hono<AppContext>();
admin.use("*", async (c, next) => {
  const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!c.env.ADMIN_API_TOKEN || token !== c.env.ADMIN_API_TOKEN) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});
admin.route("/", adminRoute);
app.route("/admin", admin);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
  /** Runs off the wrangler.toml cron trigger (see README): daily_stats rollup + win-back/rebooking nudges for each active tenant. */
  async scheduled(_event: ScheduledEvent, env: AppContext["Bindings"]): Promise<void> {
    const { createDb, schema } = await import("@serviceos/platform");
    const { eq } = await import("drizzle-orm");
    const { rollupDailyStatsForTenant } = await import("./lib/rollup");
    const { runFollowUpsForTenant } = await import("./lib/followups");
    const db = createDb(env.DB);
    const tenants = await db.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.status, "active"));
    for (const tenant of tenants) {
      await rollupDailyStatsForTenant(env, tenant.id).catch((err) => console.error(`rollup failed for tenant ${tenant.id}`, err));
      await runFollowUpsForTenant(env, tenant.id).catch((err) => console.error(`follow-ups failed for tenant ${tenant.id}`, err));
    }
  },
};

export { BookingCalendarDO };
