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

export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function renderSitePage(opts: {
  templateKey: string;
  content: SiteContent;
  sectionsEnabled: string[];
  services: ServiceForSite[];
  currency: string;
  waLink?: string;
  isDraftPreview: boolean;
}): string {
  const theme = getTheme(opts.templateKey);
  const name = escapeHtml(opts.content.businessName ?? "Our Business");
  const hero = escapeHtml(opts.content.heroText ?? theme.heroSubtext);

  const pricingSection = opts.sectionsEnabled.includes("pricing")
    ? `<section id="pricing"><h2>Services & Pricing</h2><ul class="services">${opts.services
        .map((s) => `<li><span>${escapeHtml(s.name)}</span><span>${opts.currency} ${s.price.toFixed(0)}</span></li>`)
        .join("")}</ul></section>`
    : "";

  const testimonialsSection =
    opts.sectionsEnabled.includes("testimonials") && opts.content.testimonials?.length
      ? `<section id="testimonials"><h2>What customers say</h2>${opts.content.testimonials
          .map((t) => `<blockquote>"${escapeHtml(t.quote)}" — ${escapeHtml(t.name)}</blockquote>`)
          .join("")}</section>`
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

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${name} — Book Online</title>
<meta name="description" content="${hero}" />
${opts.isDraftPreview ? '<meta name="robots" content="noindex" />' : ""}
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
<footer>Powered by ServiceOS</footer>
</body>
</html>`;
}
