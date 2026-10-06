# Danfe mobile booking website and ServBazaar connection

The website uses the supplied Danfe logo/flyer and targets Sharjah and Dubai.
Mobile visitors get a booking app home, service cards, city choices and
Home / Book / Bookings / Help navigation. Desktop retains the company website.
There are 15 pages, with 14 in the sitemap. The private portal is noindex.
Dubai has its own location page and four service pages; no Dubai office is invented.

## Business account

The connection is pinned server-side to Danfe Cleaning Company, tenant
`758794a2-6df0-4150-b160-4ab5cc7ae0ee`. The signed-in live admin was inspected:
the account is active, its subdomain is
`danfe-cleaning-company.servbazaar.com`, and www.danfecleaning.com is already
listed under it. No duplicate domain was added. This work made no live
booking, service, website publication, payment, message or DNS change.

The server reads that account's subdomain from D1. Browser headers cannot
select another tenant or upstream API destination. When the published
website design is Danfe, the tenant subdomain also renders the branded site
as a noindex preview canonicalized to www.danfecleaning.com.

## Shared records in both directions

- Website → ServBazaar: customer matching/creation, address and area,
  website-source booking, reminder task, normal staff matching/calendar
  reservation and configured deposit handling use the existing platform.
- ServBazaar → website: active services, prices/durations, published
  website name/hero/contact/address/hours, booking status, published invoices
  and payment summaries are read from the same records. The customer portal
  refreshes every 30 seconds while visible and when returning to the tab.
- Customer cancellation/rescheduling requests enter the existing general
  task queue. The booking remains unchanged until staff apply and confirm
  the request through the platform's existing booking actions and policies.
- Danfe owner/admin users can generate seven-day customer links in Bookings,
  including for bookings created in the app. Links are not auto-sent.

No separate website CRM, synchronization database or schema migration is
added. Booking prices/durations come from the selected server service.
Inactive services, past/invalid times and malformed contacts are rejected.

## Activation after deployment

1. Deploy the updated API, site engine, admin and tenant dashboards together.
   Verify that the website's DB is the same database used by this Danfe
   account and API_BASE_URL is the current API Worker origin. The checked-in
   configuration follows the repository's existing serviceos-production D1
   and https://api.servbazaar.com convention; verify them against the live
   deployment before release.
   Set both dashboard builds' VITE_API_BASE to that same verified API origin.
2. In this Danfe account's admin Website section, click **Connect Danfe
   website**. The admin-authenticated endpoint is restricted to the exact
   company account. It adds one-to-eight-hour normal/material packages at
   AED 25/AED 35 per cleaner-hour and prepares a Danfe website draft.
   Retries preserve existing services, edited prices and deactivated packages.
3. Review the service catalogue, minimum duration, working hours/coverage,
   UAE timezone, AED currency and deposit policies. Deactivate unsuitable
   durations. Review and **Publish** the Website draft. Only the published
   Danfe design and an active account enable online booking.
4. Choose the existing site-engine host dispatch or the dedicated
   wrangler.danfe.toml production Worker, routing both company hostnames to
   one selected deployment. The bare hostname redirects to www. Check
   domain/DNS ownership and existing hosting rather than overwriting it.
5. Verify a real booking in ServBazaar and a staff status/payment update in
   the customer view. Submit /sitemap.xml in Search Console and validate
   structured data on the deployed domain. Confirm the street address,
   opening hours and Google Business Profile details with the business.

The live admin currently has the old Modern/Elegant/Bold controls. The new
connect control and private booking API require deployment of this code.
Local previews disable real booking and provide a clear connection message
plus WhatsApp fallback. No search-ranking or rich-result guarantee is made.

## Privacy and security

Customer capabilities are signed, expire after seven days and are bound to
one tenant and booking. They use a different cryptographic key context
from staff JWTs and cannot log into the dashboard, read other bookings,
internal notes, draft invoices or staff contact information.

Booking references are kept in sessionStorage for the current tab. Tokens
are removed from the URL after opening a private link and sent as Bearer
headers. A clear-tab control is provided. Private pages/APIs use no-store,
the portal is noindex and excluded from the sitemap, and the privacy notice
describes online booking and session storage. No phone-only lookup is added.

The same-origin booking bridge allows only catalogue/slot, booking creation,
private details and change-request routes. It fixes the tenant server-side,
limits POST bodies to 16KB, refuses upstream redirects and applies a timeout.
Static asset delivery avoids database queries.

## Development and verification

Use the unchanged lockfile and pnpm 9.7.0. Integration tests require Node
22.13+ SQLite support or the bundled Node 24.

```sh
pnpm install --frozen-lockfile
pnpm --filter @serviceos/site-engine dev:danfe
pnpm --filter @serviceos/site-engine test:danfe
pnpm --filter @serviceos/app test:danfe
pnpm -r typecheck
pnpm --filter @serviceos/admin build
pnpm --filter @serviceos/tenant build
pnpm --filter @serviceos/site-engine build:danfe
```

The website build command is a Wrangler dry run, not deployment. The public
manifest supports standalone presentation; no native app-store release or
offline cache of personal booking records is included.

Verified on 6 October 2026:

- All five workspace packages passed TypeScript checks.
- Seven website tests passed for pages/links, metadata/schema, Dubai service
  scope, private indexing, manifest, published content escaping, live prices,
  previews/redirects, branding and the enquiry calculator.
- Four integration tests passed using real SQLite with every repository
  migration: capability security; account connection/publication and retry;
  CRM/address/booking creation and app completion; draft invoice exclusion
  and published payment totals; change tasks; bridge tenant/path/body checks.
- Admin and tenant production builds, including the tenant PWA service
  worker, succeeded using their actual Vite configs evaluated through Node.
  This bypassed a Windows sandbox restriction in the normal config loader.
- The Worker ESM bundle built using a workspace-only esbuild resolver and
  passed smoke requests. Normal Wrangler packaging must be rerun in the
  deployment environment; the standard dry run previously hit the same
  drive-root filesystem restriction.
- Browser checks covered phone-size home, city-to-book navigation,
  unavailable connection/disabled submission, narrow layout, private portal
  empty state and Dubai service content. Local checks are not evidence of
  live account activation.

The implementation is in packages/site-engine/src/danfe/, the public booking
portal and booking-access helper in packages/app, and the admin/tenant
dashboard setup and customer-link controls. No new dependency or lockfile
change is required.
