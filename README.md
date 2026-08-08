# ServiceOS

Multi-tenant booking + billing + website + WhatsApp SaaS for local service
businesses (cleaning, salons, repair techs, tutors, pet groomers, spa,
laundry, fitness trainers). Sister product to Leadvyne, sharing platform
infrastructure (Cloudflare Workers/D1/R2, payment gateway wrappers,
tenant-auth). WhatsApp is transported through a self-hosted Chatwoot
instance (`app.aiingo.com`) rather than talking to Meta's Graph API
directly — see the WhatsApp section below.

Full product spec: see the feature spec this repo was built from (booking
system, billing/VAT, WhatsApp bot, CRM, domains, website builder, Google
Ads support, and the innovative/differentiator features).

## Monorepo layout

```
packages/
  platform/     shared library: D1 schema (Drizzle), tenant resolution,
                auth (JWT + password hashing), Chatwoot integration, payment
                gateway wrappers (Razorpay/PhonePe/Telr/Network International)
  app/          booking/billing/CRM/WhatsApp Worker API (Hono) — the main
                deployed Worker, plus the BookingCalendarDO Durable Object
  site-engine/  tenant website renderer Worker — resolves hostname -> tenant
                and serves the published (or draft-preview) site; also
                serves the servbazaar.com marketing/signup landing page
apps/
  admin/        internal ops dashboard (Vite + React), container-deployed
                via Coolify — not a Cloudflare Worker
```

`packages/platform` is a library consumed by both Workers, not a Worker
itself — it has no `wrangler.toml`.

## What's implemented

- **D1 schema** (`packages/app/migrations/*.sql`, mirrored as a
  Drizzle schema in `packages/platform/src/db/schema.ts`): every table from
  the spec's suggested list, plus the supporting tables auth/billing/CRM
  need (tenant_users, refresh_tokens, customer_addresses, staff_availability,
  invoice_line_items, expenses, site_versions, broadcast_campaigns,
  social_posts).
- **Tenant resolution + auth** (`packages/platform/src/tenant`,
  `.../auth`): subdomain/custom-domain -> tenant_id middleware, HS256 JWT
  (Web Crypto, no Node-only deps), PBKDF2 password hashing.
- **Chatwoot integration** (`packages/platform/src/whatsapp/chatwoot.ts`):
  WhatsApp is self-serve. Each tenant connects their own number during
  onboarding via Meta's Embedded Signup widget
  (`POST /api/whatsapp/connect`, see `routes/whatsapp-connect.ts`), which
  provisions that tenant a fully isolated Chatwoot **Account** (not a
  shared account with per-tenant inboxes) using Chatwoot's Platform API,
  attaches a single platform Agent Bot to it (Chatwoot's supported pattern
  for one credential acting across many otherwise-isolated accounts), and
  creates the WhatsApp Cloud inbox from the signup result. Inbound
  messages arrive via one webhook (`/webhooks/chatwoot`) routed to the
  right tenant by `chatwoot_inbox_id` (globally unique across the whole
  Chatwoot instance); every API call also needs the tenant's
  `chatwoot_account_id` since accounts aren't shared. Chatwoot doesn't
  sign its webhook payloads, so a shared secret is embedded in the
  webhook URL instead (`?token=<CHATWOOT_WEBHOOK_TOKEN>`).

  **Not yet built**: the actual frontend widget that hosts Meta's
  Embedded Signup JS SDK (there's no tenant-facing onboarding UI in this
  repo yet, only the API). `GET /api/whatsapp/config` returns what such a
  widget needs (`metaAppId`, `embeddedSignupConfigId`) to initialize.
  **Worth testing before relying on it**: the exact Chatwoot Platform API
  payload shapes for account creation, Agent Bot attachment, and the
  WhatsApp Cloud inbox's `provider_config` for embedded signup — these
  vary across Chatwoot versions and weren't verified against a live
  instance.
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
- **WhatsApp bot** (`packages/app/src/lib/bot-flow.ts`): enquiry ->
  auto-quote -> booking-confirmation flow that writes directly into the
  same `bookings` table the app UI reads (no sync lag). Conversation
  *state* stays deterministic (tracked via the lead row's own columns:
  service_interest -> area -> quoted -> booked); *interpreting* each
  message — matching a service, extracting an area or date/time, judging
  urgency — is delegated to Gemini (`packages/app/src/lib/gemini.ts`,
  `GEMINI_API_KEY`/`GEMINI_MODEL`) rather than regex/keyword matching.
  Voice notes are transcribed and photos are described the same way
  (`geminiTranscribeAudio`, `geminiDescribeImage`), then routed through
  the same text flow.
- **Leads pipeline**: Hot/Warm/Neutral/Cold mood tagging, Open → Quoted →
  Booked → Closed status, conversion to a real booking.
- **Website module**: draft/live content split (`sites.draft_content` /
  `live_content`), publish action that snapshots into `site_versions` for
  rollback, per-vertical template theming
  (`packages/site-engine/src/templates/registry.ts`) with content and
  template kept decoupled, sitemap.xml/robots.txt, booking widget +
  WhatsApp click-to-chat button auto-embedded.
- **Marketing landing page** (`packages/site-engine/src/templates/landing.ts`):
  served by site-engine for the bare apex domain (and `www.`), intercepted
  before tenant host resolution runs. Includes a working signup form that
  posts straight to `POST /onboarding/signup` — the only tenant-facing UI
  in this repo; the Embedded Signup widget mentioned above still needs a
  proper frontend.
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
list): `JWT_SECRET`, `CHATWOOT_PLATFORM_API_TOKEN`, `CHATWOOT_AGENT_BOT_TOKEN`,
`CHATWOOT_WEBHOOK_TOKEN`, `GEMINI_API_KEY`, `ADMIN_API_TOKEN`, plus whichever
payment gateway keys you're testing against. `CHATWOOT_BASE_URL`,
`CHATWOOT_AGENT_BOT_ID`, `META_APP_ID`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, and
`GEMINI_MODEL` are plain vars in
`wrangler.toml`, not secrets.

## Deploying

1. Create the D1 databases and R2 buckets per environment, and fill in the
   `database_id` placeholders in `packages/app/wrangler.toml` and
   `packages/site-engine/wrangler.toml`.
2. `wrangler d1 migrations apply <db-name> --env <staging|production> --remote`
3. `wrangler secret put <NAME> --env <staging|production>` for each secret.
4. Push to `staging` or `main` — GitHub Actions (`.github/workflows/deploy.yml`)
   applies migrations and deploys both Workers.
5. The admin dashboard is a static container image built from the root
   `Dockerfile` — point Coolify at this repo (Docker-based app, default
   Dockerfile location) for its own build/deploy/preview pipeline, separate
   from the Workers pipeline above. Set the `VITE_API_BASE` build arg to
   your deployed app Worker's URL (e.g. `https://api.servbazaar.com`).
6. One-time Chatwoot setup: create a platform Agent Bot (Chatwoot Platform
   API or its UI), note its numeric ID (`CHATWOOT_AGENT_BOT_ID`) and access
   token (`CHATWOOT_AGENT_BOT_TOKEN`), and generate a Super Admin token
   (`CHATWOOT_PLATFORM_API_TOKEN`) for account creation.
7. Per-tenant WhatsApp connection is then self-serve via
   `POST /api/whatsapp/connect` (see the Chatwoot integration section
   above) — no manual per-tenant Chatwoot setup needed. `PATCH
   /admin/tenants/:id/chatwoot-inbox` remains as an ops fallback for fixing
   up a tenant's connection by hand when needed.

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
