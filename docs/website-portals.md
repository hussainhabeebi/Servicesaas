# Customer and staff website portals

Every tenant website, including Danfe, now has **Log in** and **Staff** header links. Portals use the current business name, logo, contact number, and theme. Existing guest booking remains available.

| Audience | Website path | Connected functions |
| --- | --- | --- |
| Customer | `/login`, `/account` | Personal booking history/status, catalogue pricing, booking/rebooking, configured recurrence, reschedule/cancel with existing fee rules, deposit invoices, invoice PDF download, outstanding balance and configured payment links, completed-visit reviews, loyalty count, referrals/reward status, saved addresses/preferences, password change, push reminder opt-in, WhatsApp/call and existing AI concierge |
| Staff | `/staff/login`, `/staff` | Own assigned jobs with service/address/customer contact, dated schedule, en-route/check-in/check-out, optional GPS, completion-to-draft-invoice flow, own tasks/job reminders, weekly availability, service areas and personal completed-job counts |
| Owner | Existing Customers and Team dashboard | Create/reset customer website invitations; existing staff account provisioning, assignments, team management and business operations |

## Enable accounts

1. Apply the additive `0011_customer_portal.sql` migration to the same D1 database used by both Workers; deploy both Workers and the tenant dashboard together. No existing migrations or business rate data need changing.
2. In **Customers → Website login → Invite / reset login**, create a private invitation link. Share it with the verified customer using the business's usual contact process. This action does not send messages automatically.
3. The customer opens the link, chooses a password (12+ characters) and signs in using their exact registered phone number. Invitations expire in 24 hours, are stored as hashes, and can be consumed once. A reset invalidates previous customer sessions. Existing booking history is linked by customer ID, never claimed by entering an arbitrary phone number.
4. Staff use the accounts created through the existing **Team → Invite** flow. Their tenant user must be linked to an active staff record; older logins can be connected using the Team table's Staff record selector. Staff can sign in directly on the business website and change temporary passwords in Working hours & areas. Password changes and logout revoke prior staff sessions.

The portal uses API_BASE_URL from the site Worker and the website hostname to resolve the tenant. API authorization also verifies the signed account belongs to that business. Customer tokens have a separate scope and cannot reach staff, owner or platform-admin APIs. Staff business API access is restricted to own-job actions, assigned tasks and minimal assigned-customer contacts; business management remains owner-only. Deactivated staff/users and suspended tenants lose access immediately.

## Integration dependencies and boundaries

Payment buttons display only configured gateways. They reuse the existing gateway wrappers and payment webhooks; no test payment is treated as a real payment. WhatsApp enquiries/voice notes/photos use the existing connected business number and Chatwoot bot. AI replies require Gemini credentials; push reminders require VAPID credentials and notification permission. These credentials and live integrations are not created by the code change. Rebooking suggestions and targeted reminder subscriptions require a customer session, including when called from the public website; phone numbers alone no longer grant access to booking history or someone else's reminders.

The existing scheduler handles automated follow-ups and reminders. The owner still manages reward grants, cancellation policies, pricing, team invitations and reports. Customers see published invoices rather than internal drafts. There is no separate quote-document model in this repository; catalogue pricing, the public quote API and WhatsApp quotations are the existing quote mechanisms. Staff accounts created without a linked staff record must be linked/provisioned before using job features.

Danfe's AED 25/hour and AED 35/hour with materials are business catalogue settings; portal pricing reads the catalogue. The Danfe website builder preset explicitly sets those two named hourly services when the owner loads it; it preserves other services and other tenants. The current deployment configuration is shared across tenants. New portal pages are noindex/no-store and excluded from the sitemap and PWA cache.

## Danfe website

The Website editor offers **Load Danfe website & hourly services** for a Danfe business using AED. This prepares the branded content draft and the two approved hourly catalogue rates. Preview with `?preview=1`, then use the existing Publish action. The supplied logo and team/technical-services brochure are preserved as original JPEG assets. Business logo, primary phone, address and gallery remain editable through the existing editor. No unverified ratings, licences, operating hours or technical-service prices are added.

The Danfe design has dedicated hourly-cleaning, cleaning-with-materials and technical-service URLs. Each has its own title, description, H1 and canonical URL, with internal links, real catalogue Service/Offer data, LocalBusiness, FAQ and breadcrumb structured data, Open Graph metadata and a generated sitemap. Technical work is clearly quoted separately from cleaning. Search Console submission, indexing and rankings require the actual published hostname and are not implied by these technical SEO changes.

## Validation

Use Node 24 and run `pnpm test:portals`, `pnpm typecheck`, the tenant dashboard build, and both Wrangler dry runs. Integration tests apply all real migrations to SQLite through a local D1 adapter and use the actual booking Durable Object. They cover invitation reuse/tenant mismatch, token separation, customer ownership, catalogue booking duration, staff isolation, job billing/loyalty, invoice PDF privacy, completed-visit reviews, referral reward protection, password-reset session invalidation, lockout, and private-page script/cache handling.

Before production rollout, validate the business hostname and configured external integrations in staging with real provisioned accounts. The repository implementation and automated tests do not establish live deployment, external delivery, gateway settlement or Google indexing.
