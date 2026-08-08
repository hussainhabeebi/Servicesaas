import { FAVICON_DATA_URI } from "../assets/logo";

/**
 * Standard-form Privacy Policy / Terms of Service for the marketing site.
 * This is reasonable boilerplate for a UAE-based SaaS, NOT a substitute for
 * legal review — have a lawyer check these (particularly UAE PDPL
 * compliance, VAT terms, and the third-party processor list) before they
 * govern a real customer relationship.
 */
function legalShell(title: string, rootDomain: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — ServBazaar</title>
<meta name="robots" content="noindex" />
<link rel="icon" type="image/png" href="${FAVICON_DATA_URI}" />
<style>
  body { font-family: -apple-system, system-ui, sans-serif; color: #0d2b2b; max-width: 760px; margin: 0 auto; padding: 3rem 1.5rem 5rem; line-height: 1.65; }
  a { color: #036f71; }
  h1 { font-size: 1.85rem; margin-bottom: 0.25rem; }
  .updated { color: #5b6b6a; font-size: 0.85rem; margin-bottom: 2rem; }
  h2 { font-size: 1.15rem; margin-top: 2.25rem; }
  ul { padding-left: 1.25rem; }
  .back { display: inline-block; margin-bottom: 2rem; font-size: 0.9rem; }
</style>
</head>
<body>
<a class="back" href="https://${rootDomain}/">← Back to ${rootDomain}</a>
<h1>${title}</h1>
<p class="updated">Last updated: 8 August 2026</p>
${bodyHtml}
</body>
</html>`;
}

export function renderPrivacyPolicy(rootDomain: string): string {
  return legalShell(
    "Privacy Policy",
    rootDomain,
    `
<p>ServBazaar ("we", "us") provides booking, billing, website, and WhatsApp
tools for service businesses ("tenants") and their customers. This policy
explains what we collect and how we use it.</p>

<h2>What we collect</h2>
<ul>
  <li>Tenant account information: business name, owner contact details, login credentials (passwords are hashed, never stored in plain text).</li>
  <li>Customer data entered by tenants: names, phone numbers, addresses, booking history, and payment records — processed on the tenant's behalf, not owned by us.</li>
  <li>WhatsApp messages exchanged between tenants and their customers, routed through Chatwoot.</li>
  <li>Payment transaction metadata from gateway providers (we do not store full card numbers).</li>
</ul>

<h2>How we use it</h2>
<ul>
  <li>To operate the booking, billing, WhatsApp, and website features tenants use.</li>
  <li>To generate invoices, process payments, and send booking/payment notifications.</li>
  <li>To improve the service (aggregated, de-identified usage patterns only).</li>
</ul>

<h2>Third parties we share data with</h2>
<p>Only as needed to run the service: Chatwoot (WhatsApp messaging), Meta (WhatsApp Business Platform), Google (Gemini API, for understanding messages and transcribing voice notes), payment gateways (Razorpay, PhonePe, Telr, Network International), and Cloudflare (hosting/infrastructure).</p>

<h2>Data retention</h2>
<p>We retain tenant and customer data for as long as the tenant's account is active, plus a reasonable period after closure for legal/accounting purposes (e.g. UAE VAT record-keeping requirements).</p>

<h2>Your rights</h2>
<p>Tenants can request export or deletion of their data by contacting us. End customers of a tenant should contact that business directly, as they control their own customer records.</p>

<h2>Contact</h2>
<p>Questions about this policy: <a href="https://aiingo.com">aiingo.com</a>.</p>
`
  );
}

export function renderTermsOfService(rootDomain: string): string {
  return legalShell(
    "Terms of Service",
    rootDomain,
    `
<p>These terms govern use of ServBazaar. By creating an account, you agree to them.</p>

<h2>The service</h2>
<p>ServBazaar provides booking, invoicing, a website, and WhatsApp tools for service businesses, offered on Starter (AED 99/month) and Growth (AED 199/month) plans as described on our pricing page. Features and pricing may change with notice.</p>

<h2>Your account</h2>
<ul>
  <li>You're responsible for the accuracy of information you enter and for keeping your login credentials secure.</li>
  <li>You're responsible for how your business uses the WhatsApp bot, invoicing, and customer data features — including compliance with applicable consumer protection, data protection, and tax (VAT) laws in your jurisdiction.</li>
</ul>

<h2>Billing</h2>
<p>Subscriptions are billed monthly in advance. You can cancel anytime; access continues until the end of the current billing period. No refunds for partial periods unless required by law.</p>

<h2>Acceptable use</h2>
<p>Don't use the service to send unsolicited bulk messages, engage in fraud, or violate WhatsApp's own Business Policy — accounts that do may be suspended.</p>

<h2>Third-party services</h2>
<p>Messaging, payments, and AI features depend on third parties (Meta/WhatsApp, Chatwoot, payment gateways, Google Gemini). We aren't liable for their outages or policy changes, though we'll work to minimize disruption.</p>

<h2>Limitation of liability</h2>
<p>The service is provided "as is." To the extent permitted by law, we aren't liable for indirect or consequential losses arising from use of the service.</p>

<h2>Governing law</h2>
<p>These terms are governed by the laws of the United Arab Emirates.</p>

<h2>Changes</h2>
<p>We may update these terms; material changes will be communicated to active tenants.</p>

<h2>Contact</h2>
<p><a href="https://aiingo.com">aiingo.com</a></p>
`
  );
}
