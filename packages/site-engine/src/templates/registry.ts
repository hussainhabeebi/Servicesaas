import { FAVICON_DATA_URI } from "../assets/logo";

/**
 * Content and template are decoupled (spec §8): `sites.draft_content` /
 * `live_content` hold the tenant's actual copy, while this file supplies
 * per-vertical presentation (accent color, hero framing, terminology) so
 * switching a tenant's template_key never touches their content.
 */
export interface VerticalTheme {
  label: string;
  accent: string;
  heroSubtext: string;
}

export const VERTICAL_THEMES: Record<string, VerticalTheme> = {
  cleaning: { label: "Cleaning", accent: "#0EA5E9", heroSubtext: "Spotless homes, booked in minutes" },
  salon: { label: "Salon", accent: "#DB2777", heroSubtext: "Look your best, book with ease" },
  repair: { label: "Repair", accent: "#F59E0B", heroSubtext: "Fast, reliable technicians near you" },
  tutoring: { label: "Tutoring", accent: "#6366F1", heroSubtext: "Learning, on your schedule" },
  pet_care: { label: "Pet Care", accent: "#16A34A", heroSubtext: "Happy pets, trusted care" },
  fitness: { label: "Fitness", accent: "#EF4444", heroSubtext: "Train smarter, book instantly" },
  spa_laundry: { label: "Spa & Laundry", accent: "#0D9488", heroSubtext: "Relax — we've got it handled" },
  generic: { label: "Services", accent: "#4F46E5", heroSubtext: "Book our services in minutes" },
};

export function getTheme(templateKey: string): VerticalTheme {
  return VERTICAL_THEMES[templateKey] ?? VERTICAL_THEMES.generic!;
}

export interface SiteContent {
  businessName?: string;
  heroText?: string;
  hours?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  gallery?: string[];
  testimonials?: Array<{ name: string; quote: string }>;
  languages?: string[];
}

export interface ServiceForSite {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
}

export interface ReviewForSite {
  rating: number;
  comment: string | null;
  customerName: string | null;
}

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

export function renderSitePage(opts: {
  templateKey: string;
  content: SiteContent;
  sectionsEnabled: string[];
  services: ServiceForSite[];
  reviews: ReviewForSite[];
  currency: string;
  waLink?: string;
  isDraftPreview: boolean;
  canonicalUrl: string;
  phone?: string;
}): string {
  const theme = getTheme(opts.templateKey);
  const name = escapeHtml(opts.content.businessName ?? "Our Business");
  const hero = escapeHtml(opts.content.heroText ?? theme.heroSubtext);

  const pricingSection = opts.sectionsEnabled.includes("pricing")
    ? `<section id="pricing"><h2>Services & Pricing</h2><ul class="services">${opts.services
        .map((s) => `<li><span>${escapeHtml(s.name)}</span><span>${opts.currency} ${s.price.toFixed(0)}</span></li>`)
        .join("")}</ul></section>`
    : "";

  // Real submitted reviews take priority over hand-typed testimonials — an
  // honest signal beats manually-entered copy. Falls back to the manual
  // list only when there are no real reviews yet.
  const reviewsToShow = opts.reviews.length > 0 ? opts.reviews : null;
  const manualTestimonials = !reviewsToShow && opts.content.testimonials?.length ? opts.content.testimonials : null;

  const testimonialsSection =
    opts.sectionsEnabled.includes("testimonials") && (reviewsToShow || manualTestimonials)
      ? `<section id="testimonials"><h2>What customers say</h2>${
          reviewsToShow
            ? reviewsToShow
                .map(
                  (r) =>
                    `<blockquote>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}${r.comment ? ` "${escapeHtml(r.comment)}"` : ""} — ${escapeHtml(r.customerName ?? "Verified customer")}</blockquote>`
                )
                .join("")
            : manualTestimonials!.map((t) => `<blockquote>"${escapeHtml(t.quote)}" — ${escapeHtml(t.name)}</blockquote>`).join("")
        }</section>`
      : "";

  const gallerySection =
    opts.sectionsEnabled.includes("gallery") && opts.content.gallery?.length
      ? `<section id="gallery"><h2>Gallery</h2><div class="gallery">${opts.content.gallery
          .map((url) => `<img src="${escapeHtml(url)}" alt="${name} photo" loading="lazy" />`)
          .join("")}</div></section>`
      : "";

  const serviceAreaSection = opts.sectionsEnabled.includes("service_area_map")
    ? `<section id="service-area"><h2>Where we work</h2><p>${escapeHtml(opts.content.address ?? "Serving your area")}</p></section>`
    : "";

  // Structured data: only claim what's actually true. AggregateRating is
  // omitted entirely (not zeroed/faked) when there are no real reviews yet.
  const ratingCount = opts.reviews.length;
  const avgRating = ratingCount > 0 ? Math.round((opts.reviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount) * 10) / 10 : null;

  const localBusiness: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: opts.content.businessName ?? "Our Business",
    description: opts.content.heroText ?? theme.heroSubtext,
    url: opts.canonicalUrl,
    ...(opts.phone ? { telephone: opts.phone } : {}),
    ...(opts.content.address ? { address: { "@type": "PostalAddress", streetAddress: opts.content.address } } : {}),
    ...(opts.content.logoUrl ? { image: opts.content.logoUrl } : {}),
    priceRange: opts.currency,
    ...(avgRating && ratingCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: avgRating, reviewCount: ratingCount } }
      : {}),
  };

  const serviceListLd =
    opts.services.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: opts.services.map((s, i) => ({
            "@type": "Service",
            position: i + 1,
            name: s.name,
            offers: { "@type": "Offer", price: s.price, priceCurrency: opts.currency },
          })),
        }
      : null;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name} — Book Online</title>
<meta name="description" content="${hero}" />
<link rel="canonical" href="${escapeHtml(opts.canonicalUrl)}" />
<link rel="icon" href="${opts.content.logoUrl ? escapeHtml(opts.content.logoUrl) : FAVICON_DATA_URI}" />
<meta property="og:type" content="business.business" />
<meta property="og:title" content="${name}" />
<meta property="og:description" content="${hero}" />
<meta property="og:url" content="${escapeHtml(opts.canonicalUrl)}" />
${opts.content.logoUrl ? `<meta property="og:image" content="${escapeHtml(opts.content.logoUrl)}" />` : ""}
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${name}" />
<meta name="twitter:description" content="${hero}" />
${opts.isDraftPreview ? '<meta name="robots" content="noindex" />' : ""}
${jsonLdScript(localBusiness)}
${serviceListLd ? jsonLdScript(serviceListLd) : ""}
<style>
  :root { --accent: ${theme.accent}; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; color: #111827; background: #fff; }
  header { padding: 3rem 1.5rem; text-align: center; background: linear-gradient(135deg, var(--accent), #111827); color: #fff; }
  header h1 { margin: 0 0 0.5rem; font-size: 2rem; }
  main { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem; }
  section { margin-bottom: 2.5rem; }
  h2 { border-bottom: 2px solid var(--accent); padding-bottom: 0.4rem; }
  ul.services { list-style: none; padding: 0; }
  ul.services li { display: flex; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px solid #e5e7eb; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; }
  .gallery img { width: 100%; border-radius: 8px; object-fit: cover; aspect-ratio: 1; }
  blockquote { font-style: italic; color: #374151; }
  .cta { display: inline-block; margin-top: 1rem; padding: 0.9rem 1.6rem; background: var(--accent); color: #fff; border-radius: 999px; text-decoration: none; font-weight: 600; }
  .wa-button { position: fixed; bottom: 1.25rem; right: 1.25rem; background: #25D366; color: #fff; border-radius: 999px; padding: 0.9rem 1.3rem; text-decoration: none; box-shadow: 0 4px 14px rgba(0,0,0,.2); font-weight: 600; }
  footer { text-align: center; padding: 2rem; color: #6b7280; font-size: 0.85rem; }
</style>
</head>
<body>
<header>
  <h1>${name}</h1>
  <p>${hero}</p>
  <a class="cta" href="#pricing">Book Now</a>
</header>
<main>
  ${pricingSection}
  ${gallerySection}
  ${testimonialsSection}
  ${serviceAreaSection}
  <section id="contact"><h2>Contact</h2><p>${escapeHtml(opts.content.hours ?? "")}</p>${opts.content.phone ? `<p>${escapeHtml(opts.content.phone)}</p>` : ""}</section>
</main>
${opts.waLink ? `<a class="wa-button" href="${escapeHtml(opts.waLink)}" target="_blank" rel="noopener">Chat on WhatsApp</a>` : ""}
<footer>Powered by ServBazaar</footer>
</body>
</html>`;
}
