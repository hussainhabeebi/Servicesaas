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
  admin/        internal ops dashboard (Vite + React) — Cloudflare Pages,
                admin.{root domain}
  tenant/       tenant-facing dashboard (Vite + React) — Cloudflare Pages,
                app.{root domain}. Leads and Customers are deliberately
                separate pages/data views throughout, never merged.
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
- **Location-based staff availability** (`lib/staff-matching.ts`) — for
  on-site verticals like cleaning where a job's neighbourhood determines
  who can even take it: each `staff` row has a `service_areas` list
  (blank = covers everywhere), matched against a booking's free-text
  `area` (same convention as `leads.area`/`customer_addresses.area`)
  alongside `staff_availability` working hours and existing bookings, to
  find who's actually free. All three booking-creation paths (app API,
  WhatsApp bot, public website widget) auto-assign the first match when
  the tenant has more than one crew member; solo operators (no `staff`
  rows) are unaffected. When nobody matches, the app/website paths still
  create the booking unassigned and drop a `staff_assignment` task for a
  human to pick manually — the WhatsApp bot asks for a different
  time/area instead of confirming a job nobody can do. Tenants manage
  areas and hours from the new **Staff** page (`apps/tenant`), and
  `GET /api/bookings/available-staff` backs the "who's free" picker
  shown next to any unassigned booking.
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
  before tenant host resolution runs. Full SEO (Open Graph, Twitter Card,
  JSON-LD `SoftwareApplication`+`FAQPage`, its own sitemap.xml/robots.txt),
  animations, an FAQ section, and working signup/login forms that hand off
  a JWT to `apps/tenant` (see below) via `?token=` — localStorage doesn't
  cross the `servbazaar.com` → `app.servbazaar.com` origin boundary, so the
  token rides in the URL once, then gets stored and scrubbed from the
  address bar.
- **Tenant dashboard** (`apps/tenant`, Cloudflare Pages): the owner-facing
  app — Today, Leads (kanban), Customers (CRM), Bookings, Quotes &
  Invoices, Services, Staff, Team, Tasks, Reports, Broadcasts, Vendor
  Bills, WhatsApp, Billing. Installable as a PWA (manifest + service
  worker + custom install prompt), branded with the ServBazaar mark.
  **Leads and Customers are intentionally separate pages backed by
  separate tables** (`leads` vs `customers`) — a lead only becomes a
  customer once they actually book, and the two views are never merged,
  so "who's a live prospect" and "who's already paid you" stay visually
  and structurally distinct.
- **WhatsApp connection with coexistence support** (`apps/tenant`'s
  WhatsApp page + `routes/whatsapp-connect.ts`): the Meta Embedded Signup
  widget is now actually built (previously only the backend existed).
  Explicitly surfaces Meta's WhatsApp Business app + Cloud API
  "coexistence" path — a tenant who already runs the consumer WhatsApp
  Business app keeps using it exactly as before (no lost chats/contacts,
  nothing deregistered) while the bot also starts handling that same
  number. Which path Meta actually offered a given number is read from
  the Embedded Signup postMessage event and stored on
  `tenants.onboarding_type` for support visibility — not something the
  tenant chooses up front, since Meta decides eligibility per number.
- **No-show protection / deposits** (`services.deposit_type`/
  `deposit_value`, `lib/deposits.ts`): a service can require a fixed AED
  amount or a percentage of its price as a deposit. Every booking-creation
  path (app, WhatsApp bot, public widget) auto-creates and WhatsApp-sends
  a dedicated deposit invoice the moment a booking is made — reusing the
  exact same invoice/PDF/payment-link machinery a normal invoice uses
  (`invoices.kind = 'deposit'`) rather than a parallel payment system.
  Configured per-service from the new Services page.
- **Real reviews on tenant websites** (`site-engine/templates/registry.ts`):
  actually-submitted reviews (`reviews` table, rating + comment) now
  render as testimonials on a tenant's own site, with an honest
  `AggregateRating` JSON-LD block — omitted entirely when there are no
  real reviews yet, never faked. Falls back to the tenant's hand-typed
  testimonials only when no real reviews exist.
- **Deep SEO pass, both sites**: tenant sites gained `LocalBusiness` +
  `Service`/`Offer` JSON-LD, Open Graph/Twitter tags, a canonical link,
  and a favicon (the tenant's uploaded logo, or ServBazaar's mark as a
  fallback so no site ships faviconless). The marketing site gained a
  real Open Graph share image (`GET /og-image.jpg`, rendered once via a
  headless-browser screenshot of the actual brand gradient + logo, then
  served as static bytes baked into the Worker — data URIs aren't
  reliably fetched by social-share crawlers, so this needed a real URL)
  and an `Organization` JSON-LD block alongside the existing
  `SoftwareApplication`/`FAQPage` schema.
- **Light loyalty tracking** (`customers.completed_bookings_count`,
  `lib/loyalty.ts`): auto-increments whenever a booking is marked
  completed (guarded against double-counting), surfaced as a milestone
  badge on the Customers page. No separate rewards ledger — a visibility
  tool, not an automated discount engine.
- **Website + domain UI, both self-serve and admin-side**: the site content
  editor (draft/publish/version-rollback) and Cloudflare for SaaS
  custom-domain flow (DNS record translation, status polling) had real
  backends from the start but no frontend anywhere until now. Core logic
  lives in `lib/site-management.ts`/`lib/domain-management.ts`, called by
  both the tenant's own **Website**/**Domain** pages (self-serve) and the
  admin panel's tenant detail page (support override, audit-logged as
  `edit_tenant_site`/`publish_tenant_site`/`add_tenant_domain`) — one
  backend, two UIs, so they can never drift out of sync with each other.
- **Free custom-domain path (`domains.type = 'manual'`)**: an alternative to
  the Cloudflare for SaaS Custom Hostname flow above, which needs the
  account's Fallback Origin configured and can gate on plan/quota. Here the
  tenant's domain becomes its own zone on Cloudflare — nameservers move to
  Cloudflare at the registrar, then an `A` record (`192.0.2.1`, proxied) plus
  a Workers Route to `site-engine` are added directly in that zone, which
  gets Universal SSL automatically with no API token needed. This is a
  manual, one-time-per-domain setup rather than something the app can drive
  via API, so `addManualDomain`/`markManualDomainActive` just register the
  row (`status: 'manual_pending'`) and let the tenant or ops flip it to
  `active` once they've verified it resolves — `tenantResolutionMiddleware`
  matches on the `domains` row alone, regardless of how the domain got
  pointed there. Both dashboards default to this path and show the setup
  steps inline; audit-logged on the admin side as
  `add_tenant_domain`/`activate_tenant_domain`.
- **Reporting**: `daily_stats` rollup (scheduled Worker cron, 00:00
  Asia/Dubai), a "Today" endpoint for the home screen (today's bookings +
  money in/owed), and a cash-flow forecast (confirmed bookings due in the
  next 7 days).
- **Admin dashboard**: tenant list/detail, suspend/reactivate, plan
  upgrade/downgrade, platform-wide stats, plus two support tools —
  **reset a tenant owner's password** and **log in as a tenant** (both
  audit-logged to `admin_audit_log`). Guarded by real per-person admin
  accounts (`admin_users`, `POST /admin-auth/login`, password + lockout,
  same as tenant login) rather than a single shared secret — see
  "Securing admin access" below for how day-to-day access now works and
  how to create the first admin account.
- **Login security** (both tenant and admin): PBKDF2 password hashing,
  timing-safe verification, and brute-force lockout — 5 failed attempts
  locks the account for 15 minutes (`lib/lockout.ts`, shared by both
  login routes). Previously neither login had any lockout at all.
- **Tasks & reminders** (`tasks` table, `routes/tasks.ts`): a job-day
  reminder is created automatically 1 day before every booking, from all
  three booking-creation paths (API, WhatsApp bot, public widget) via a
  shared `lib/tasks.ts` helper — plus manual follow-up/general tasks.
- **Automated follow-ups & win-back, rebooking nudges**
  (`lib/followups.ts`): runs off the same daily cron as the stats rollup.
  Nudges leads that have sat at "quoted" for ~48h, and customers whose
  last completed booking for a recurring-eligible service was ~30 days
  ago. Deliberately simple — a narrow "N hours/days ago" window instead
  of a tracked "already nudged" flag, so each condition fires once per
  day rather than needing a state machine.
- **Team management** (`routes/team.ts`): invite a staff member — creates
  both a login (`tenant_users`, role `staff`) and the operational
  crew record (`staff`) used for job assignment, linked via
  `tenant_users.staff_id`. Returns a generated temp password directly in
  the response (no email/SMS delivery wired up — the owner shares it).
- **Team performance / win rate / AR aging** (`routes/reports.ts`):
  straightforward aggregate queries, not a separate analytics pipeline.
  Win rate is tenant-wide (leads aren't assigned to individual staff in
  this schema — the WhatsApp bot is one shared front door per tenant);
  jobs-completed-per-staff is genuine via `bookings.staff_id`.
- **Broadcast / bulk messaging** (`routes/broadcast.ts`): a real send
  loop over `broadcast_campaigns` — resolves the audience (all customers,
  or filtered by tag), sends via Chatwoot with a small delay between
  messages (same batch+delay rate-limiting pattern as the platform's
  other bulk-send code). Fine for the dozens-to-low-hundreds audience a
  single service business actually has; a queue-based sender (Cloudflare
  Queues) would be the next step for larger audiences.
- **Referrals** (`routes/referrals.ts`): manual tracking — record who
  referred whom, mark the reward granted. No auto-matching of new
  signups against pending referrals.
- **Vendor bills** (`routes/vendor-bills.ts`): simple accounts-payable
  list, separate from the per-job `expenses` table.
- **Calendar sync** (`routes/calendar-sync.ts`): Cal.com connects for
  real — its v1 API just needs an API key, verified against
  `GET /v1/me` on connect, no OAuth app registration required. Google
  Calendar needs a real Google Cloud OAuth client this environment can't
  provision, so that endpoint returns a clear 501 instead of faking a
  connection. Neither path auto-pushes new bookings to the connected
  calendar yet — the credential is stored, the push isn't wired in.
- **Self-serve billing** (`routes/billing.ts`): plan display + a
  change-plan action. Not automated recurring charge collection — none
  of the payment gateway wrappers in this repo support subscription
  billing (only one-off payment links), so actually charging the tenant
  each month needs a separate platform-billing integration this pass
  doesn't build.
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
  provider. (This is different from the location-based *matching* above,
  which just answers "who covers this area and is free" — optimization
  would sequence a staff member's multiple jobs in a day by travel time.)
- **Google Ads support (§9)** — `ad_campaigns` table and CRUD-level
  scaffolding exist; the Conversion API integration and "Boost this
  service" one-tap launch are not built.
- **n8n social posting** — `social_posts` table exists; the posting
  worker isn't built. (Bulk WhatsApp messaging itself *is* built — see
  Broadcast above.)
- **Native WhatsApp Forms** (structured intake instead of free-text
  chat) — needs a Flow built and registered in Meta's Business Manager
  Flow Builder, which can't be done from code alone; not built.
- **B2B / CPQ suite** (contracts, recurring commercial clients) — not
  implemented; `customers.has_active_contract` exists as a flag but
  there's no contract or quote-builder data model behind it yet.
- **Arabic / RTL support** — not implemented. Deliberately deferred rather
  than done shallowly: it touches the WhatsApp bot's Gemini prompts, every
  site-engine template (landing, tenant sites, legal pages) needing RTL
  CSS, and invoice PDFs — and `pdf-lib` (used by `lib/pdf.ts`) doesn't do
  Arabic contextual letter shaping out of the box, so Arabic invoice text
  would render as disconnected, incorrect glyphs without a proper
  shaping-aware font pipeline. `tenants.locale` (`en`/`ar`) already exists
  as a schema seam for whenever this gets built properly.
- **Usage-based pricing tier for WhatsApp conversation costs** — not
  implemented. Meta bills WhatsApp Business Platform conversations
  per-conversation, a cost that scales with a tenant's message volume
  while Starter/Growth are flat AED 99/199 — a real margin risk once
  usage is high enough, worth watching, but the actual tier
  structure/pricing numbers are a business decision, not something to
  invent unprompted in code.
- **Public discovery/directory page** (e.g. `servbazaar.com/dubai/cleaning`
  listing tenants) — not implemented. ServBazaar currently sells tools to
  existing businesses; it doesn't bring them new customers the way a
  marketplace does. A public directory built from real tenant data + real
  reviews would double as inbound SEO, but needs a per-tenant opt-in
  (not every tenant wants to be publicly listed) that doesn't exist yet.

## Local development

```bash
pnpm install
pnpm --filter @serviceos/app dev            # app Worker on :8787
pnpm --filter @serviceos/site-engine dev    # site-engine Worker
pnpm --filter @serviceos/admin dev          # admin dashboard on :4173
pnpm --filter @serviceos/tenant dev         # tenant dashboard on :4174
```

Each Worker needs its secrets set locally (`wrangler secret put <NAME>` or
a `.dev.vars` file — see `packages/platform/src/types/env.ts` for the full
list): `JWT_SECRET`, `CHATWOOT_PLATFORM_API_TOKEN`, `CHATWOOT_AGENT_BOT_TOKEN`,
`CHATWOOT_WEBHOOK_TOKEN`, `GEMINI_API_KEY`, `ADMIN_API_TOKEN`, plus whichever
payment gateway keys you're testing against. `CHATWOOT_BASE_URL`,
`CHATWOOT_AGENT_BOT_ID`, `META_APP_ID`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, and
`GEMINI_MODEL` are plain vars in
`wrangler.toml`, not secrets.

## Securing admin access

`ADMIN_API_TOKEN` used to be the entire admin auth model — one shared
secret, pasted into a text box in `apps/admin`, same for everyone. It's now
**bootstrap-only**: its one remaining job is creating the first real admin
account, after which day-to-day access is per-person (email + password,
lockout after 5 failed attempts, individually revocable).

After deploying, create the first admin account once per environment:

```bash
curl -X POST https://api.<root-domain>/admin-bootstrap/users \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Your Name", "email": "you@example.com"}'
```

This returns a `tempPassword` — log in with it at `admin.<root-domain>`
(`POST /admin-auth/login`), and from then on you can invite further admins
from the **Admins** page in the dashboard itself (`POST /admin/users`,
gated by your own admin JWT) without touching `ADMIN_API_TOKEN` again.
Keep that token itself as secret as any other credential — anyone holding
it can mint new admin accounts.

## Deploying

1. Create the D1 databases and R2 buckets per environment, and fill in the
   `database_id` placeholders in `packages/app/wrangler.toml` and
   `packages/site-engine/wrangler.toml`.
2. `wrangler d1 migrations apply <db-name> --env <staging|production> --remote`
3. `wrangler secret put <NAME> --env <staging|production>` for each secret.
4. Push to `staging` or `main` — GitHub Actions (`.github/workflows/deploy.yml`)
   applies migrations and deploys both Workers.
5. Both `apps/admin` and `apps/tenant` deploy as Cloudflare Pages
   projects (Git-connected, one project per app): Root directory
   `apps/admin` or `apps/tenant`, build command
   `pnpm --filter <package-name> build`, output directory `dist`, build
   variable `VITE_API_BASE` = your deployed app Worker's URL (e.g.
   `https://api.servbazaar.com`). Attach `admin.{root domain}` /
   `app.{root domain}` as each project's custom domain — since the domain
   is already on Cloudflare, this auto-creates the DNS record. A
   root-level `Dockerfile` also exists, but only builds `apps/admin`
   (nginx-based, SPA fallback configured) for Docker-based hosts like
   Coolify — not required for the Cloudflare Pages path above, and
   `apps/tenant` doesn't have an equivalent yet.
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
