# ServiceOS

Multi-tenant booking + billing + website + WhatsApp SaaS for local service
businesses (cleaning, salons, repair techs, tutors, pet groomers, spa,
laundry, fitness trainers). Sister product to Leadvyne, sharing platform
infrastructure (Cloudflare Workers/D1/R2, the WhatsApp BSP, payment gateway
wrappers, tenant-auth).

Full product spec: see the feature spec this repo was built from (booking
system, billing/VAT, WhatsApp bot, CRM, domains, website builder, Google
Ads support, and the innovative/differentiator features).

## Monorepo layout

```
packages/
  platform/     shared library: D1 schema (Drizzle), tenant resolution,
                auth (JWT + password hashing), WhatsApp router, payment
                gateway wrappers (Razorpay/PhonePe/Telr/Network International)
  app/          booking/billing/CRM/WhatsApp Worker API (Hono) — the main
                deployed Worker, plus the BookingCalendarDO Durable Object
  site-engine/  tenant website renderer Worker — resolves hostname -> tenant
                and serves the published (or draft-preview) site
apps/
  admin/        internal ops dashboard (Vite + React), container-deployed
                via Coolify — not a Cloudflare Worker
```

`packages/platform` is a library consumed by both Workers, not a Worker
itself — it has no `wrangler.toml`.

## What's implemented

- **D1 schema** (`packages/app/migrations/0001_init.sql`, mirrored as a
  Drizzle schema in `packages/platform/src/db/schema.ts`): every table from
  the spec's suggested list, plus the supporting tables auth/billing/CRM
  need (tenant_users, refresh_tokens, customer_addresses, staff_availability,
  invoice_line_items, expenses, wa_phone_mapping, site_versions,
  broadcast_campaigns, social_posts).
- **Tenant resolution + auth** (`packages/platform/src/tenant`,
  `.../auth`): subdomain/custom-domain -> tenant_id middleware, HS256 JWT
  (Web Crypto, no Node-only deps), PBKDF2 password hashing.
- **WhatsApp router** (`packages/platform/src/whatsapp`): shared
  `phone_number_id -> tenant_id` routing table (same shared WABA as
  Leadvyne), webhook signature verification, Graph API send helper.
- **Payment gateway wrappers**: Razorpay, PhonePe, Telr, Network
  International — each implements a common `PaymentGateway` interface
  (`createPaymentLink` / `verifyCallback`).
- **Self-serve onboarding** (`POST /onboarding/signup`): one call
  provisions the tenant row, subdomain, default services for the chosen
  vertical, default staff, a blank site draft, and the owner's login.
- **Booking system**: multi-staff or solo-operator bookings, recurring
  jobs, a Durable Object (`BookingCalendarDO`, one instance per
  tenant+staff) that serializes slot reservation so two customers can't
  double-book the same staff member, reschedule/cancel with a
  configurable cancellation-fee cutoff, status pipeline
  (Scheduled → En route → In Progress → Completed), GPS/manual
  check-in/out.
- **Billing**: quote → invoice, multi-line items, UAE VAT (tenant-level
  `vat_rate`), invoice PDF generation (`pdf-lib`) stored in R2 and sent
  over WhatsApp, payment recording + gateway payment links, cash/partial/
  overdue tracking.
- **WhatsApp bot** (`packages/app/src/lib/bot-flow.ts`): rule-based
  enquiry → auto-quote → booking-confirmation flow that writes directly
  into the same `bookings` table the app UI reads (no sync lag). Voice
  notes are transcribed and photos are described via Workers AI
  (`@cf/openai/whisper`, `@cf/llava-hf/llava-1.5-7b-hf`) when the `AI`
  binding is available, then routed through the same text flow.
- **Leads pipeline**: Hot/Warm/Neutral/Cold mood tagging, Open → Quoted →
  Booked → Closed status, conversion to a real booking.
- **Website module**: draft/live content split (`sites.draft_content` /
  `live_content`), publish action that snapshots into `site_versions` for
  rollback, per-vertical template theming
  (`packages/site-engine/src/templates/registry.ts`) with content and
  template kept decoupled, sitemap.xml/robots.txt, booking widget +
  WhatsApp click-to-chat button auto-embedded.
- **Domain module**: Cloudflare for SaaS custom-hostname registration,
  plain-language DNS record translation, status polling
  (`POST /domains/:id/check`), subdomain always active as fallback.
- **Reporting**: `daily_stats` rollup (scheduled Worker cron, 00:00
  Asia/Dubai), a "Today" endpoint for the home screen (today's bookings +
  money in/owed), and a cash-flow forecast (confirmed bookings due in the
  next 7 days).
- **Admin dashboard**: tenant list/detail, suspend/reactivate,
  plan upgrade/downgrade, platform-wide stats — guarded by a static admin
  bearer token (`ADMIN_API_TOKEN`), not a tenant JWT, since it's
  cross-tenant.
- **CI/CD**: GitHub Actions applies D1 migrations and deploys both
  Workers on push to `staging` / `main`, mirroring the spec's
  staging/production D1 split.

### Deliberately stubbed / roadmap

A few of the spec's differentiator features (§10) need real trained models
or third-party accounts this repo can't provision on its own, so they're
left as clearly-marked seams rather than faked:

- **AI no-show predictor** — `bookings.no_show_risk_score` column exists;
  no scoring model is wired in yet.
- **Dynamic pricing suggestions** — not implemented; needs an aggregate
  cross-tenant pricing dataset first.
- **Staff route optimization** — not implemented; needs a routing/maps
  provider.
- **Google Ads support (§9)** — `ad_campaigns` table and CRUD-level
  scaffolding exist; the Conversion API integration and "Boost this
  service" one-tap launch are not built.
- **Bulk/campaign messaging, n8n social posting** — `broadcast_campaigns`
  and `social_posts` tables exist; the send/post workers aren't built.

## Local development

```bash
pnpm install
pnpm --filter @serviceos/app dev            # app Worker on :8787
pnpm --filter @serviceos/site-engine dev    # site-engine Worker
pnpm --filter @serviceos/admin dev          # admin dashboard on :4173
```

Each Worker needs its secrets set locally (`wrangler secret put <NAME>` or
a `.dev.vars` file — see `packages/platform/src/types/env.ts` for the full
list): `JWT_SECRET`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `WA_ACCESS_TOKEN`,
`ADMIN_API_TOKEN`, plus whichever payment gateway keys you're testing
against.

## Deploying

1. Create the D1 databases and R2 buckets per environment, and fill in the
   `database_id` placeholders in `packages/app/wrangler.toml` and
   `packages/site-engine/wrangler.toml`.
2. `wrangler d1 migrations apply <db-name> --env <staging|production> --remote`
3. `wrangler secret put <NAME> --env <staging|production>` for each secret.
4. Push to `staging` or `main` — GitHub Actions (`.github/workflows/deploy.yml`)
   applies migrations and deploys both Workers.
5. The admin dashboard is a static container image (`apps/admin/Dockerfile`)
   — point Coolify at this repo for its own build/deploy/preview pipeline,
   separate from the Workers pipeline above.

## Design notes worth knowing before extending this

- **tenant_id is never optional** on tenant-scoped tables — every query in
  `packages/app/src/routes/*` filters on it explicitly rather than relying
  on row-level security, since D1/SQLite has none.
- **Two ways tenant_id gets resolved**: from the request `Host` header
  (`tenantResolutionMiddleware`, used by the public site-engine and the
  unauthenticated storefront routes under `/public`) or from the caller's
  JWT (`requireAuth`, used by everything under `/api`). Don't mix them —
  an authenticated route trusts the JWT's `tenant_id`, not the Host header.
- **The booking Durable Object is keyed per (tenant_id, staff_id)**, not
  per tenant — so two different staff members' calendars never contend
  for the same DO instance, and solo-operator bookings (`staff_id`
  omitted) skip DO locking entirely since there's nothing to double-book
  against.
- **The WhatsApp bot's "state"** lives in the `leads` row's own columns
  (service_interest → area → status=quoted → booked) rather than a
  separate state machine table — deliberately simple for the MVP flow in
  `bot-flow.ts`; a real multi-turn conversation engine would likely want
  a Durable Object per conversation instead.
