import { FAVICON_DATA_URI } from "../assets/logo";

/**
 * Content and template are decoupled (spec §8): `sites.draft_content` /
 * `live_content` hold the tenant's actual copy, while this file supplies
 * per-vertical presentation (accent color, hero framing, terminology) so
 * switching a tenant's template_key never touches their content.
 *
 * Visual language deliberately mirrors the platform's own marketing
 * landing page (templates/landing.ts) — sticky nav, gradient hero,
 * scroll-reveal sections — plus an app-like sticky action bar and a real
 * booking flow (posts straight to /public/bookings, see pwa.ts + index.ts
 * for the manifest/service-worker wiring that makes each tenant site
 * independently installable).
 */
export interface VerticalTheme {
  label: string;
  accent: string;
  accentDark: string;
  heroSubtext: string;
  emoji: string;
}

export const VERTICAL_THEMES: Record<string, VerticalTheme> = {
  cleaning: { label: "Cleaning", accent: "#0EA5E9", accentDark: "#0369A1", heroSubtext: "Spotless homes, booked in minutes", emoji: "🧹" },
  salon: { label: "Salon", accent: "#DB2777", accentDark: "#9D174D", heroSubtext: "Look your best, book with ease", emoji: "💇" },
  repair: { label: "Repair", accent: "#F59E0B", accentDark: "#B45309", heroSubtext: "Fast, reliable technicians near you", emoji: "🔧" },
  tutoring: { label: "Tutoring", accent: "#6366F1", accentDark: "#4338CA", heroSubtext: "Learning, on your schedule", emoji: "📚" },
  pet_care: { label: "Pet Care", accent: "#16A34A", accentDark: "#166534", heroSubtext: "Happy pets, trusted care", emoji: "🐾" },
  fitness: { label: "Fitness", accent: "#EF4444", accentDark: "#B91C1C", heroSubtext: "Train smarter, book instantly", emoji: "🏋️" },
  spa_laundry: { label: "Spa & Laundry", accent: "#0D9488", accentDark: "#115E59", heroSubtext: "Relax — we've got it handled", emoji: "🧺" },
  generic: { label: "Services", accent: "#4F46E5", accentDark: "#3730A3", heroSubtext: "Book our services in minutes", emoji: "✨" },
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
  category?: string | null;
  description?: string | null;
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

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr${h > 1 ? "s" : ""}` : `${h}h ${m}m`;
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
  apiBaseUrl: string;
}): string {
  const theme = getTheme(opts.templateKey);
  const name = escapeHtml(opts.content.businessName ?? "Our Business");
  const hero = escapeHtml(opts.content.heroText ?? theme.heroSubtext);
  const iconHref = opts.content.logoUrl ? escapeHtml(opts.content.logoUrl) : FAVICON_DATA_URI;
  const touchIconHref = opts.content.logoUrl ? escapeHtml(opts.content.logoUrl) : "/icon-192.png";

  const showPricing = opts.sectionsEnabled.includes("pricing") && opts.services.length > 0;
  const showGallery = opts.sectionsEnabled.includes("gallery") && !!opts.content.gallery?.length;
  const showServiceArea = opts.sectionsEnabled.includes("service_area_map");

  // Real submitted reviews take priority over hand-typed testimonials — an
  // honest signal beats manually-entered copy. Falls back to the manual
  // list only when there are no real reviews yet.
  const reviewsToShow = opts.reviews.length > 0 ? opts.reviews : null;
  const manualTestimonials = !reviewsToShow && opts.content.testimonials?.length ? opts.content.testimonials : null;
  const showTestimonials = opts.sectionsEnabled.includes("testimonials") && !!(reviewsToShow || manualTestimonials);

  const ratingCount = opts.reviews.length;
  const avgRating = ratingCount > 0 ? Math.round((opts.reviews.reduce((sum, r) => sum + r.rating, 0) / ratingCount) * 10) / 10 : null;

  const servicesSection = showPricing
    ? `<section id="pricing" class="reveal">
        <h2>Services</h2>
        <p class="subhead">Pick a service to book instantly.</p>
        <div class="svc-grid">
          ${opts.services
            .map(
              (s) => `<div class="svc-card" data-service="${s.id}" onclick="openBooking('${s.id}')">
                ${s.category ? `<span class="svc-cat">${escapeHtml(s.category)}</span>` : ""}
                <h3>${escapeHtml(s.name)}</h3>
                ${s.description ? `<p class="svc-desc">${escapeHtml(s.description)}</p>` : ""}
                <div class="svc-meta"><span class="svc-dur">⏱ ${fmtDuration(s.duration_minutes)}</span><span class="svc-price">${opts.currency} ${s.price.toFixed(0)}</span></div>
                <button type="button" class="svc-book">Book this</button>
              </div>`
            )
            .join("")}
        </div>
      </section>`
    : "";

  const testimonialsSection = showTestimonials
    ? `<section id="testimonials" class="reveal">
        <h2>What customers say</h2>
        ${avgRating ? `<p class="subhead">${"★".repeat(Math.round(avgRating))}${"☆".repeat(5 - Math.round(avgRating))} ${avgRating} out of 5 · ${ratingCount} review${ratingCount === 1 ? "" : "s"}</p>` : ""}
        <div class="testimonials">
          ${
            reviewsToShow
              ? reviewsToShow
                  .slice(0, 9)
                  .map(
                    (r) =>
                      `<div class="testimonial"><div class="t-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div>${r.comment ? `<p class="quote">"${escapeHtml(r.comment)}"</p>` : ""}<div class="who">— ${escapeHtml(r.customerName ?? "Verified customer")}</div></div>`
                  )
                  .join("")
              : manualTestimonials!.map((t) => `<div class="testimonial"><div class="t-stars">★★★★★</div><p class="quote">"${escapeHtml(t.quote)}"</p><div class="who">— ${escapeHtml(t.name)}</div></div>`).join("")
          }
        </div>
      </section>`
    : "";

  const gallerySection = showGallery
    ? `<section id="gallery" class="reveal">
        <h2>Gallery</h2>
        <div class="gallery">${opts.content
          .gallery!.map((url) => `<img src="${escapeHtml(url)}" alt="${name} photo" loading="lazy" />`)
          .join("")}</div>
      </section>`
    : "";

  const serviceAreaSection = showServiceArea
    ? `<section id="service-area" class="reveal">
        <h2>Where we work</h2>
        <p class="subhead" style="margin-bottom:0">${escapeHtml(opts.content.address ?? "Serving your area")}</p>
      </section>`
    : "";

  // Structured data: only claim what's actually true. AggregateRating is
  // omitted entirely (not zeroed/faked) when there are no real reviews yet.
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
    ...(avgRating && ratingCount > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: avgRating, reviewCount: ratingCount } } : {}),
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

  const servicesJson = JSON.stringify(opts.services.map((s) => ({ id: s.id, name: s.name, price: s.price, duration_minutes: s.duration_minutes })));
  const telHref = opts.phone ? `tel:${opts.phone.replace(/[^\d+]/g, "")}` : null;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${name} — Book Online</title>
<meta name="description" content="${hero}" />
<link rel="canonical" href="${escapeHtml(opts.canonicalUrl)}" />
<link rel="icon" href="${iconHref}" />
<link rel="apple-touch-icon" href="${touchIconHref}" />
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="${theme.accent}" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="${name}" />
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
  :root { --accent: ${theme.accent}; --accent-dark: ${theme.accentDark}; --ink: #0f172a; --muted: #64748b; --cream: #f8fafc; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html { scroll-behavior: smooth; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; color: var(--ink); background: #fff; overflow-x: hidden; padding-bottom: calc(76px + env(safe-area-inset-bottom)); }

  nav { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1.25rem; background: rgba(255,255,255,0.9); backdrop-filter: blur(8px); border-bottom: 1px solid #f1f5f9; transition: box-shadow 0.2s; }
  nav.scrolled { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
  nav .brand { display: inline-flex; align-items: center; gap: 0.55rem; font-weight: 800; font-size: 1.02rem; color: var(--ink); text-decoration: none; }
  nav .brand img { width: 30px; height: 30px; border-radius: 8px; object-fit: cover; display: block; }
  nav .links { display: none; align-items: center; gap: 1.4rem; }
  nav .links a { color: var(--muted); text-decoration: none; font-size: 0.9rem; }
  @media (min-width: 720px) { nav .links { display: flex; } }
  nav .nav-actions { display: flex; align-items: center; gap: 0.6rem; }
  nav .nav-book { background: var(--accent); color: #fff; border: none; padding: 0.55rem 1.15rem; border-radius: 999px; font-weight: 700; font-size: 0.86rem; cursor: pointer; }

  header { position: relative; padding: 3.5rem 1.5rem 3rem; text-align: center; background: linear-gradient(135deg, var(--accent), var(--accent-dark)); color: #fff; overflow: hidden; }
  header::before, header::after { content: ""; position: absolute; border-radius: 50%; filter: blur(50px); opacity: 0.28; }
  header::before { width: 240px; height: 240px; background: #fff; top: -70px; left: -50px; }
  header::after { width: 200px; height: 200px; background: #fff; bottom: -80px; right: -40px; }
  header .inner { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; }
  .biz-logo { width: 68px; height: 68px; border-radius: 18px; object-fit: cover; margin: 0 auto 1rem; box-shadow: 0 8px 24px rgba(0,0,0,0.2); display: block; opacity: 0; animation: fadeInUp 0.6s ease forwards; }
  header h1 { margin: 0 0 0.6rem; font-size: clamp(1.7rem, 5vw, 2.4rem); font-weight: 800; opacity: 0; animation: fadeInUp 0.6s ease 0.08s forwards; }
  header p.hero-text { max-width: 480px; margin: 0 auto; font-size: 1.05rem; opacity: 0; animation: fadeInUp 0.6s ease 0.16s forwards; color: rgba(255,255,255,0.92); }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin-top: 1.1rem; opacity: 0; animation: fadeInUp 0.6s ease 0.24s forwards; }
  .chip { background: rgba(255,255,255,0.16); border: 1px solid rgba(255,255,255,0.3); color: #fff; padding: 0.35rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; display: inline-flex; align-items: center; gap: 0.3rem; }
  header .cta-row { margin-top: 1.6rem; display: flex; gap: 0.7rem; justify-content: center; flex-wrap: wrap; opacity: 0; animation: fadeInUp 0.6s ease 0.32s forwards; }
  .cta { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.85rem 1.6rem; background: #fff; color: var(--accent); border-radius: 999px; text-decoration: none; font-weight: 700; border: none; cursor: pointer; font-size: 0.95rem; transition: transform 0.15s; }
  .cta:active { transform: scale(0.97); }
  .cta.ghost { background: rgba(255,255,255,0.12); color: #fff; border: 2px solid rgba(255,255,255,0.55); }

  main { max-width: 900px; margin: 0 auto; padding: 0 1.25rem; }
  section { margin: 3.25rem 0; }
  h2 { text-align: center; font-size: 1.5rem; margin-bottom: 0.4rem; }
  .subhead { text-align: center; color: var(--muted); margin-bottom: 1.75rem; font-size: 0.92rem; }

  .reveal { opacity: 0; transform: translateY(20px); transition: opacity 0.55s ease, transform 0.55s ease; }
  .reveal.visible { opacity: 1; transform: translateY(0); }

  .svc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
  .svc-card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 1.35rem; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s; position: relative; }
  .svc-card:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(0,0,0,0.08); border-color: var(--accent); }
  .svc-cat { display: inline-block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--accent); margin-bottom: 0.35rem; }
  .svc-card h3 { margin: 0 0 0.3rem; font-size: 1.02rem; }
  .svc-desc { color: var(--muted); font-size: 0.86rem; margin: 0 0 0.75rem; }
  .svc-meta { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--muted); margin-bottom: 0.9rem; }
  .svc-price { font-weight: 800; color: var(--ink); font-size: 1.05rem; }
  .svc-book { width: 100%; padding: 0.65rem; border-radius: 10px; border: none; background: var(--cream); color: var(--accent); font-weight: 700; font-size: 0.88rem; cursor: pointer; transition: background 0.2s, color 0.2s; }
  .svc-card:hover .svc-book { background: var(--accent); color: #fff; }

  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem; }
  .gallery img { width: 100%; border-radius: 12px; object-fit: cover; aspect-ratio: 1; }

  .testimonials { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1.1rem; }
  .testimonial { background: var(--cream); border-radius: 14px; padding: 1.4rem; }
  .t-stars { color: #d97706; margin-bottom: 0.4rem; font-size: 0.95rem; }
  .testimonial p.quote { color: #334155; font-style: italic; margin: 0 0 0.6rem; font-size: 0.92rem; }
  .testimonial .who { font-size: 0.82rem; color: var(--muted); }

  footer { text-align: center; padding: 2.5rem 1.25rem 2rem; color: var(--muted); font-size: 0.85rem; border-top: 1px solid #f1f5f9; margin-top: 1rem; }
  footer .contact-line { margin-bottom: 0.5rem; color: #334155; }
  footer .by { font-size: 0.78rem; margin-top: 0.75rem; }
  footer .by a { color: var(--accent); text-decoration: none; font-weight: 600; }

  /* App-like sticky bottom action bar */
  .action-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 60; background: #fff; border-top: 1px solid #e2e8f0; display: flex; gap: 0.6rem; padding: 0.65rem 0.9rem; padding-bottom: max(0.65rem, env(safe-area-inset-bottom)); box-shadow: 0 -6px 20px rgba(0,0,0,0.07); }
  .action-bar .icon-btn { flex: 0 0 auto; width: 48px; height: 48px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; text-decoration: none; color: var(--ink); }
  .action-bar .book-btn { flex: 1; border: none; border-radius: 12px; background: var(--accent); color: #fff; font-weight: 700; font-size: 0.98rem; cursor: pointer; }

  /* PWA install banner */
  .install-banner { position: fixed; left: 0.75rem; right: 0.75rem; bottom: calc(76px + env(safe-area-inset-bottom) + 0.6rem); z-index: 61; background: var(--ink); color: #fff; border-radius: 14px; padding: 0.85rem 1rem; display: none; align-items: center; gap: 0.75rem; box-shadow: 0 12px 28px rgba(0,0,0,0.25); }
  .install-banner.show { display: flex; }
  .install-banner .txt { flex: 1; font-size: 0.85rem; line-height: 1.35; }
  .install-banner button { border: none; border-radius: 8px; padding: 0.5rem 0.85rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; }
  .install-banner .install-yes { background: var(--accent); color: #fff; }
  .install-banner .install-no { background: transparent; color: rgba(255,255,255,0.7); }

  /* Booking modal — bottom sheet on mobile, dialog on desktop */
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.55); z-index: 100; align-items: flex-end; justify-content: center; }
  .modal-overlay.open { display: flex; }
  .modal { background: #fff; border-radius: 20px 20px 0 0; padding: 1.5rem 1.35rem calc(1.5rem + env(safe-area-inset-bottom)); width: 100%; max-width: 460px; max-height: 88vh; overflow-y: auto; position: relative; animation: slideUp 0.28s ease; }
  @keyframes slideUp { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @media (min-width: 560px) { .modal-overlay { align-items: center; } .modal { border-radius: 20px; } }
  .modal .sheet-handle { width: 40px; height: 4px; background: #e2e8f0; border-radius: 999px; margin: 0 auto 1rem; }
  .modal h3 { margin: 0 0 1rem; font-size: 1.15rem; }
  .modal .close { position: absolute; top: 1rem; right: 1.1rem; border: none; background: none; font-size: 1.3rem; cursor: pointer; color: var(--muted); }
  .modal label { font-size: 0.82rem; font-weight: 600; color: #334155; display: block; margin-bottom: 0.3rem; margin-top: 0.85rem; }
  .modal select, .modal input, .modal textarea { width: 100%; padding: 0.7rem 0.85rem; border: 1px solid #d1d5db; border-radius: 10px; font-size: 0.95rem; font-family: inherit; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  .modal button[type="submit"] { width: 100%; margin-top: 1.4rem; padding: 0.95rem; border-radius: 12px; border: none; background: var(--accent); color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; }
  .modal button[type="submit"]:disabled { opacity: 0.6; }
  .modal-result { margin-top: 0.9rem; font-size: 0.88rem; text-align: center; }
  .modal-result.error { color: #dc2626; }
  .modal-success { text-align: center; padding: 1rem 0; }
  .modal-success .check { width: 56px; height: 56px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; margin: 0 auto 1rem; }
  .modal-success h3 { margin-bottom: 0.4rem; }
  .modal-success p { color: var(--muted); font-size: 0.9rem; }
  .modal-success button { margin-top: 1.25rem; width: 100%; padding: 0.85rem; border-radius: 12px; border: none; background: var(--cream); color: var(--ink); font-weight: 700; cursor: pointer; }

  /* Rebook nudge banner — returning customers */
  .rebook-bar { display: none; align-items: center; gap: 0.75rem; background: var(--cream); border-bottom: 1px solid #e2e8f0; padding: 0.65rem 1.25rem; font-size: 0.86rem; }
  .rebook-bar.show { display: flex; }
  .rebook-bar .txt { flex: 1; color: #334155; }
  .rebook-bar .txt strong { color: var(--ink); }
  .rebook-bar button { border: none; border-radius: 999px; padding: 0.4rem 0.9rem; font-weight: 700; font-size: 0.8rem; cursor: pointer; }
  .rebook-bar .rb-go { background: var(--accent); color: #fff; }
  .rebook-bar .rb-dismiss { background: none; color: var(--muted); }

  /* Add-on suggestion chips in the booking modal */
  .addon-suggestions { margin-top: 0.85rem; }
  .addon-suggestions .label { font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.4rem; }
  .addon-chip-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .addon-chip { border: 1px solid #d1d5db; border-radius: 999px; padding: 0.4rem 0.8rem; font-size: 0.8rem; background: #fff; cursor: pointer; display: inline-flex; align-items: center; gap: 0.35rem; transition: background 0.15s, border-color 0.15s, color 0.15s; }
  .addon-chip.selected { background: var(--accent); border-color: var(--accent); color: #fff; }

  /* Smart time-slot chips */
  .slot-suggestions { margin-top: 0.6rem; display: flex; flex-wrap: wrap; gap: 0.45rem; }
  .slot-chip { border: 1px solid #d1d5db; border-radius: 10px; padding: 0.4rem 0.7rem; font-size: 0.78rem; background: #fff; cursor: pointer; position: relative; }
  .slot-chip.recommended { border-color: var(--accent); color: var(--accent-dark); font-weight: 700; }
  .slot-chip.recommended::after { content: '★'; margin-left: 0.3rem; font-size: 0.7rem; }
  .slot-chip.chosen { background: var(--accent); border-color: var(--accent); color: #fff; }

  /* Post-booking cross-sell */
  .cross-sell { margin-top: 1.1rem; border: 1px dashed #cbd5e1; border-radius: 14px; padding: 1rem; text-align: left; }
  .cross-sell .label { font-size: 0.78rem; font-weight: 700; color: #475569; margin-bottom: 0.5rem; }
  .cross-sell .row { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
  .cross-sell .name { font-weight: 700; font-size: 0.92rem; }
  .cross-sell .price { color: var(--muted); font-size: 0.82rem; }
  .cross-sell button { border: none; border-radius: 999px; background: var(--accent); color: #fff; font-weight: 700; font-size: 0.8rem; padding: 0.45rem 0.9rem; cursor: pointer; }

  /* Push-notification opt-in */
  .push-opt-in { margin-top: 0.9rem; width: 100%; padding: 0.7rem; border-radius: 10px; border: 1px solid #d1d5db; background: #fff; color: var(--ink); font-weight: 700; font-size: 0.85rem; cursor: pointer; }
  .push-opt-in.subscribed { border-color: #16a34a; color: #16a34a; }

  /* AI concierge */
  .concierge-fab { position: fixed; right: 1rem; bottom: calc(92px + env(safe-area-inset-bottom)); z-index: 62; width: 54px; height: 54px; border-radius: 50%; border: none; background: var(--ink); color: #fff; font-size: 1.4rem; cursor: pointer; box-shadow: 0 10px 24px rgba(0,0,0,0.22); display: flex; align-items: center; justify-content: center; }
  .concierge-panel { position: fixed; right: 0.85rem; left: 0.85rem; bottom: calc(154px + env(safe-area-inset-bottom)); z-index: 63; max-width: 380px; margin-left: auto; background: #fff; border-radius: 18px; box-shadow: 0 16px 40px rgba(0,0,0,0.25); display: none; flex-direction: column; max-height: 60vh; overflow: hidden; }
  .concierge-panel.open { display: flex; }
  .concierge-head { background: var(--accent); color: #fff; padding: 0.85rem 1rem; display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 0.9rem; }
  .concierge-head button { background: none; border: none; color: #fff; font-size: 1.1rem; cursor: pointer; }
  .concierge-body { flex: 1; overflow-y: auto; padding: 0.85rem; display: flex; flex-direction: column; gap: 0.55rem; }
  .concierge-msg { max-width: 85%; padding: 0.55rem 0.75rem; border-radius: 12px; font-size: 0.84rem; line-height: 1.4; }
  .concierge-msg.user { align-self: flex-end; background: var(--accent); color: #fff; border-bottom-right-radius: 2px; }
  .concierge-msg.assistant { align-self: flex-start; background: var(--cream); color: var(--ink); border-bottom-left-radius: 2px; }
  .concierge-msg .book-cta { display: block; margin-top: 0.5rem; border: none; border-radius: 8px; padding: 0.4rem 0.7rem; background: #fff; color: var(--accent); font-weight: 700; font-size: 0.78rem; cursor: pointer; }
  .concierge-input-row { display: flex; gap: 0.5rem; padding: 0.7rem; border-top: 1px solid #f1f5f9; }
  .concierge-input-row input { flex: 1; border: 1px solid #d1d5db; border-radius: 999px; padding: 0.5rem 0.9rem; font-size: 0.85rem; font-family: inherit; }
  .concierge-input-row button { border: none; border-radius: 999px; width: 38px; height: 38px; background: var(--accent); color: #fff; font-size: 1rem; cursor: pointer; flex: 0 0 auto; }
</style>
</head>
<body>

<nav id="navbar">
  <a class="brand" href="/">${opts.content.logoUrl ? `<img src="${escapeHtml(opts.content.logoUrl)}" alt="" />` : `<span style="width:30px;height:30px;border-radius:8px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:1rem;">${theme.emoji}</span>`}${name}</a>
  <div class="links">
    ${showPricing ? '<a href="#pricing">Services</a>' : ""}
    ${showTestimonials ? '<a href="#testimonials">Reviews</a>' : ""}
    <a href="#contact">Contact</a>
  </div>
  <div class="nav-actions">
    <button class="nav-book" type="button" onclick="openBooking()">Book Now</button>
  </div>
</nav>

<div class="rebook-bar" id="rebook-bar">
  <span class="txt" id="rebook-text"></span>
  <button class="rb-dismiss" type="button" onclick="dismissRebook()">Not now</button>
  <button class="rb-go" type="button" id="rebook-go">Book again</button>
</div>

<header>
  <div class="inner">
    ${opts.content.logoUrl ? `<img class="biz-logo" src="${escapeHtml(opts.content.logoUrl)}" alt="${name} logo" />` : ""}
    <h1>${name}</h1>
    <p class="hero-text">${hero}</p>
    <div class="chips">
      ${avgRating ? `<span class="chip">★ ${avgRating} (${ratingCount})</span>` : ""}
      ${opts.content.hours ? `<span class="chip">🕐 ${escapeHtml(opts.content.hours)}</span>` : ""}
      ${opts.content.address ? `<span class="chip">📍 ${escapeHtml(opts.content.address)}</span>` : ""}
    </div>
    <div class="cta-row">
      <button class="cta" type="button" onclick="openBooking()">📅 Book Now</button>
      ${opts.waLink ? `<a class="cta ghost" href="${escapeHtml(opts.waLink)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}
    </div>
  </div>
</header>

<main>
  ${servicesSection}
  ${gallerySection}
  ${testimonialsSection}
  ${serviceAreaSection}
</main>

<footer id="contact">
  ${opts.content.hours ? `<div class="contact-line">🕐 ${escapeHtml(opts.content.hours)}</div>` : ""}
  ${opts.content.phone ? `<div class="contact-line">📞 ${escapeHtml(opts.content.phone)}</div>` : ""}
  ${opts.content.address ? `<div class="contact-line">📍 ${escapeHtml(opts.content.address)}</div>` : ""}
  <div class="by">Powered by <a href="https://servbazaar.com" target="_blank" rel="noopener">ServBazaar</a></div>
</footer>

<div class="action-bar">
  ${telHref ? `<a class="icon-btn" href="${telHref}" aria-label="Call">📞</a>` : ""}
  ${opts.waLink ? `<a class="icon-btn" href="${escapeHtml(opts.waLink)}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ""}
  <button class="book-btn" type="button" onclick="openBooking()">Book Now</button>
</div>

<div class="install-banner" id="install-banner">
  <span class="txt">Add ${name} to your home screen for faster booking next time.</span>
  <button class="install-no" type="button" onclick="dismissInstall()">Not now</button>
  <button class="install-yes" type="button" onclick="doInstall()">Install</button>
</div>

<div class="modal-overlay" id="booking-overlay">
  <div class="modal">
    <div class="sheet-handle"></div>
    <button class="close" type="button" onclick="closeBooking()" aria-label="Close">&times;</button>
    <div id="booking-form-wrap">
      <h3>Book with ${name}</h3>
      <form id="booking-form">
        <label for="bf-service">Service</label>
        <select id="bf-service" name="service_id" required></select>
        <div class="addon-suggestions" id="addon-wrap" style="display:none">
          <div class="label">Frequently booked together</div>
          <div class="addon-chip-row" id="addon-chip-row"></div>
        </div>
        <div class="row2">
          <div>
            <label for="bf-date">Date</label>
            <input id="bf-date" name="date" type="date" required />
          </div>
          <div>
            <label for="bf-time">Time</label>
            <input id="bf-time" name="time" type="time" required />
          </div>
        </div>
        <div class="slot-suggestions" id="slot-suggestions"></div>
        <label for="bf-name">Your name</label>
        <input id="bf-name" name="customer_name" required minlength="2" />
        <label for="bf-phone">Phone</label>
        <input id="bf-phone" name="customer_phone" required placeholder="+971501234567" />
        <label for="bf-address">Address / area (optional)</label>
        <input id="bf-address" name="address_line" />
        <button type="submit">Confirm booking</button>
      </form>
      <div class="modal-result" id="booking-result"></div>
    </div>
    <div id="booking-success" style="display:none">
      <div class="modal-success">
        <div class="check">✓</div>
        <h3>You're booked!</h3>
        <p id="booking-success-detail"></p>
        <div class="cross-sell" id="cross-sell" style="display:none">
          <div class="label">Add before you go?</div>
          <div class="row">
            <div>
              <div class="name" id="cross-sell-name"></div>
              <div class="price" id="cross-sell-price"></div>
            </div>
            <button type="button" id="cross-sell-add">Add</button>
          </div>
        </div>
        <button class="push-opt-in" type="button" id="push-opt-in" onclick="enablePush()">🔔 Get a reminder before your visit</button>
        <button type="button" onclick="closeBooking()">Done</button>
      </div>
    </div>
  </div>
</div>

<button class="concierge-fab" type="button" id="concierge-fab" aria-label="Chat with us" onclick="toggleConcierge()">💬</button>
<div class="concierge-panel" id="concierge-panel">
  <div class="concierge-head">
    <span>Ask ${name}</span>
    <button type="button" onclick="toggleConcierge()" aria-label="Close chat">&times;</button>
  </div>
  <div class="concierge-body" id="concierge-body">
    <div class="concierge-msg assistant">Hi! What can we help you book today?</div>
  </div>
  <form class="concierge-input-row" id="concierge-form">
    <input id="concierge-input" type="text" placeholder="Ask about a service…" autocomplete="off" />
    <button type="submit" aria-label="Send">➤</button>
  </form>
</div>

<script>
  var API_BASE = ${JSON.stringify(opts.apiBaseUrl)};
  var SERVICES = ${servicesJson};
  var CURRENCY = ${JSON.stringify(opts.currency)};

  // Register the per-tenant service worker (pwa.ts) so this site is
  // installable from its own origin — safe to call unconditionally, no-op
  // in browsers without support or in preview iframes without HTTPS.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // --- Rebook nudge for returning customers ---
  (function () {
    var phone;
    try { phone = localStorage.getItem('sb_customer_phone'); } catch (err) { phone = null; }
    if (!phone || localStorage.getItem('sb_rebook_dismissed') === phone) return;
    fetch(API_BASE + '/public/suggestions/rebook?phone=' + encodeURIComponent(phone), { headers: { 'X-Site-Host': window.location.host } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.suggestion) return;
        document.getElementById('rebook-text').innerHTML = 'Welcome back! Ready to book <strong>' + data.suggestion.serviceName + '</strong> again?';
        document.getElementById('rebook-go').addEventListener('click', function () { openBooking(data.suggestion.serviceId); });
        document.getElementById('rebook-bar').classList.add('show');
      })
      .catch(function () {});
  })();
  function dismissRebook() {
    document.getElementById('rebook-bar').classList.remove('show');
    try {
      var phone = localStorage.getItem('sb_customer_phone');
      if (phone) localStorage.setItem('sb_rebook_dismissed', phone);
    } catch (err) {}
  }

  // Nav shadow on scroll
  var navbar = document.getElementById('navbar');
  window.addEventListener('scroll', function () {
    if (window.scrollY > 8) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  });

  // Scroll-reveal animations
  var revealEls = document.querySelectorAll('.reveal');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  revealEls.forEach(function (el) { observer.observe(el); });

  // --- Booking modal ---
  var serviceSelect = document.getElementById('bf-service');
  SERVICES.forEach(function (s) {
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name + ' — ' + CURRENCY + ' ' + s.price.toFixed(0);
    serviceSelect.appendChild(opt);
  });
  var dateInput = document.getElementById('bf-date');
  var timeInput = document.getElementById('bf-time');
  var today = new Date();
  dateInput.min = today.toISOString().slice(0, 10);

  var selectedAddons = []; // [{id, name, price, duration_minutes}]

  function renderAddonChips(suggestions) {
    var wrap = document.getElementById('addon-wrap');
    var row = document.getElementById('addon-chip-row');
    row.innerHTML = '';
    selectedAddons = [];
    if (!suggestions || suggestions.length === 0) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    suggestions.forEach(function (s) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'addon-chip';
      chip.textContent = '+ ' + s.name + ' — ' + CURRENCY + ' ' + s.price.toFixed(0);
      chip.addEventListener('click', function () {
        var idx = selectedAddons.findIndex(function (a) { return a.id === s.id; });
        if (idx >= 0) { selectedAddons.splice(idx, 1); chip.classList.remove('selected'); }
        else { selectedAddons.push({ id: s.id, name: s.name, price: s.price, duration_minutes: s.durationMinutes }); chip.classList.add('selected'); }
      });
      row.appendChild(chip);
    });
  }

  function loadAddonSuggestions() {
    if (!serviceSelect.value) return;
    fetch(API_BASE + '/public/suggestions/addons?service_id=' + encodeURIComponent(serviceSelect.value), { headers: { 'X-Site-Host': window.location.host } })
      .then(function (r) { return r.json(); })
      .then(function (data) { renderAddonChips(data.suggestions); })
      .catch(function () {});
  }
  serviceSelect.addEventListener('change', loadAddonSuggestions);

  function renderSlotChips(slots) {
    var box = document.getElementById('slot-suggestions');
    box.innerHTML = '';
    (slots || []).filter(function (s) { return s.recommended; }).slice(0, 4).forEach(function (s) {
      var d = new Date(s.start);
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'slot-chip recommended';
      chip.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      chip.addEventListener('click', function () {
        timeInput.value = d.toTimeString().slice(0, 5);
        box.querySelectorAll('.slot-chip').forEach(function (c) { c.classList.remove('chosen'); });
        chip.classList.add('chosen');
      });
      box.appendChild(chip);
    });
  }
  function loadSlotSuggestions() {
    if (!dateInput.value || !serviceSelect.value) return;
    fetch(API_BASE + '/public/suggestions/best-slots?service_id=' + encodeURIComponent(serviceSelect.value) + '&date=' + dateInput.value, { headers: { 'X-Site-Host': window.location.host } })
      .then(function (r) { return r.json(); })
      .then(function (data) { renderSlotChips(data.slots); })
      .catch(function () {});
  }
  dateInput.addEventListener('change', loadSlotSuggestions);

  function openBooking(serviceId) {
    if (serviceId) serviceSelect.value = serviceId;
    loadAddonSuggestions();
    document.getElementById('booking-form-wrap').style.display = '';
    document.getElementById('booking-success').style.display = 'none';
    document.getElementById('booking-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeBooking() {
    document.getElementById('booking-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
  document.getElementById('booking-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeBooking();
  });

  function bookOne(serviceId, customerName, customerPhone, addressLine, scheduledStartIso) {
    return fetch(API_BASE + '/public/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Site-Host': window.location.host },
      body: JSON.stringify({ service_id: serviceId, customer_name: customerName, customer_phone: customerPhone, address_line: addressLine || undefined, scheduled_start: scheduledStartIso }),
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); });
  }

  function showCrossSell(primaryServiceId, addonIds) {
    var box = document.getElementById('cross-sell');
    var excludeIds = [primaryServiceId].concat(addonIds);
    fetch(API_BASE + '/public/suggestions/addons?service_id=' + encodeURIComponent(primaryServiceId) + '&exclude=' + encodeURIComponent(excludeIds.join(',')), { headers: { 'X-Site-Host': window.location.host } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var suggestion = data.suggestions && data.suggestions[0];
        if (!suggestion) return;
        document.getElementById('cross-sell-name').textContent = suggestion.name;
        document.getElementById('cross-sell-price').textContent = CURRENCY + ' ' + suggestion.price.toFixed(0);
        box.style.display = '';
        document.getElementById('cross-sell-add').onclick = function () {
          box.querySelector('button').disabled = true;
          document.getElementById('cross-sell-add').textContent = 'Adding…';
          var start = new Date(Date.now() + 24 * 3600000).toISOString();
          bookOne(suggestion.id, lastCustomerName, lastCustomerPhone, lastAddressLine, start).then(function () {
            box.innerHTML = '<div class="label">Added — we\\'ll be in touch to confirm the time.</div>';
          });
        };
      })
      .catch(function () {});
  }

  var lastCustomerName = '', lastCustomerPhone = '', lastAddressLine = '';

  document.getElementById('booking-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var resultEl = document.getElementById('booking-result');
    var submitBtn = form.querySelector('button[type="submit"]');
    resultEl.className = 'modal-result';
    resultEl.textContent = '';

    if (!form.date.value || !form.time.value) return;
    var scheduledStart = new Date(form.date.value + 'T' + form.time.value + ':00').toISOString();
    lastCustomerName = form.customer_name.value;
    lastCustomerPhone = form.customer_phone.value;
    lastAddressLine = form.address_line.value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Booking…';

    bookOne(form.service_id.value, lastCustomerName, lastCustomerPhone, lastAddressLine, scheduledStart)
      .then(function (result) {
        if (!result.ok) return result;
        // Stack any selected add-ons back-to-back right after the primary booking.
        var chain = Promise.resolve(result);
        var cursor = result.data.scheduled_end;
        selectedAddons.forEach(function (addon) {
          chain = chain.then(function (prev) {
            return bookOne(addon.id, lastCustomerName, lastCustomerPhone, lastAddressLine, cursor).then(function (addonResult) {
              if (addonResult.ok) cursor = addonResult.data.scheduled_end;
              return prev; // keep resolving with the primary booking's result for the success message
            });
          });
        });
        return chain;
      })
      .then(function (result) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm booking';
        if (!result.ok) {
          resultEl.className = 'modal-result error';
          resultEl.textContent = typeof result.data.error === 'string' ? result.data.error : 'Please double-check your details and try again.';
          return;
        }
        document.getElementById('booking-form-wrap').style.display = 'none';
        document.getElementById('booking-success').style.display = '';
        var detail = 'We\\'ve got you down for ' + new Date(scheduledStart).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.';
        if (selectedAddons.length) detail += ' Plus ' + selectedAddons.map(function (a) { return a.name; }).join(', ') + ', back-to-back.';
        if (result.data.depositRequired) detail += ' A deposit of ' + CURRENCY + ' ' + Number(result.data.depositRequired).toFixed(0) + ' may be requested to confirm.';
        document.getElementById('booking-success-detail').textContent = detail;
        try { localStorage.setItem('sb_customer_phone', lastCustomerPhone); } catch (err) {}
        document.getElementById('cross-sell').style.display = 'none';
        showCrossSell(form.service_id.value, selectedAddons.map(function (a) { return a.id; }));
        resetPushButton();
        form.reset();
      })
      .catch(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm booking';
        resultEl.className = 'modal-result error';
        resultEl.textContent = 'Could not reach the server — please try again.';
      });
  });

  // --- PWA install prompt ---
  var deferredInstallPrompt = null;
  var installBanner = document.getElementById('install-banner');
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    var dismissed = localStorage.getItem('pwa-install-dismissed');
    if (!isStandalone && !dismissed) installBanner.classList.add('show');
  });
  function dismissInstall() {
    installBanner.classList.remove('show');
    localStorage.setItem('pwa-install-dismissed', '1');
  }
  function doInstall() {
    installBanner.classList.remove('show');
    if (deferredInstallPrompt) deferredInstallPrompt.prompt();
  }

  // --- AI concierge ---
  var conciergeHistory = [];
  var conciergePanel = document.getElementById('concierge-panel');
  var conciergeBody = document.getElementById('concierge-body');
  function toggleConcierge() { conciergePanel.classList.toggle('open'); }
  function addConciergeMsg(role, text, bookServiceId) {
    var msg = document.createElement('div');
    msg.className = 'concierge-msg ' + role;
    msg.textContent = text;
    if (bookServiceId) {
      var cta = document.createElement('button');
      cta.type = 'button';
      cta.className = 'book-cta';
      cta.textContent = 'Book this service';
      cta.addEventListener('click', function () { toggleConcierge(); openBooking(bookServiceId); });
      msg.appendChild(cta);
    }
    conciergeBody.appendChild(msg);
    conciergeBody.scrollTop = conciergeBody.scrollHeight;
  }
  document.getElementById('concierge-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = document.getElementById('concierge-input');
    var text = input.value.trim();
    if (!text) return;
    addConciergeMsg('user', text);
    conciergeHistory.push({ role: 'user', text: text });
    input.value = '';
    fetch(API_BASE + '/public/concierge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Site-Host': window.location.host },
      body: JSON.stringify({ message: text, history: conciergeHistory.slice(-8) }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        addConciergeMsg('assistant', data.reply, data.matchedServiceId);
        conciergeHistory.push({ role: 'assistant', text: data.reply });
        if (data.openBooking && data.matchedServiceId) { toggleConcierge(); openBooking(data.matchedServiceId); }
      })
      .catch(function () { addConciergeMsg('assistant', 'Sorry, something went wrong — please try again.'); });
  });

  // --- Push notification opt-in ---
  function urlBase64ToUint8Array(base64) {
    var padding = '='.repeat((4 - (base64.length % 4)) % 4);
    var base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64Safe);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function resetPushButton() {
    var btn = document.getElementById('push-opt-in');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { btn.style.display = 'none'; return; }
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (sub) { btn.textContent = '🔔 Reminders on'; btn.classList.add('subscribed'); }
      else { btn.textContent = '🔔 Get a reminder before your visit'; btn.classList.remove('subscribed'); }
    }).catch(function () {});
  }
  function enablePush() {
    var btn = document.getElementById('push-opt-in');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    fetch(API_BASE + '/public/push/vapid-public-key', { headers: { 'X-Site-Host': window.location.host } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.publicKey) return;
        return navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.publicKey) });
        }).then(function (sub) {
          var json = sub.toJSON();
          return fetch(API_BASE + '/public/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Site-Host': window.location.host },
            body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, customer_phone: lastCustomerPhone || undefined }),
          });
        });
      })
      .then(function () { resetPushButton(); })
      .catch(function () { btn.textContent = 'Could not enable reminders'; });
  }
</script>
</body>
</html>`;
}
