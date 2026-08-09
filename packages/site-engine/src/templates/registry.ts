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
        <button type="button" onclick="closeBooking()">Done</button>
      </div>
    </div>
  </div>
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
  var today = new Date();
  dateInput.min = today.toISOString().slice(0, 10);

  function openBooking(serviceId) {
    if (serviceId) serviceSelect.value = serviceId;
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

  document.getElementById('booking-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var resultEl = document.getElementById('booking-result');
    var submitBtn = form.querySelector('button[type="submit"]');
    resultEl.className = 'modal-result';
    resultEl.textContent = '';

    if (!form.date.value || !form.time.value) return;
    var scheduledStart = new Date(form.date.value + 'T' + form.time.value + ':00').toISOString();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Booking…';

    fetch(API_BASE + '/public/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Site-Host': window.location.host },
      body: JSON.stringify({
        service_id: form.service_id.value,
        customer_name: form.customer_name.value,
        customer_phone: form.customer_phone.value,
        address_line: form.address_line.value || undefined,
        scheduled_start: scheduledStart,
      }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
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
        if (result.data.depositRequired) detail += ' A deposit of ' + CURRENCY + ' ' + Number(result.data.depositRequired).toFixed(0) + ' may be requested to confirm.';
        document.getElementById('booking-success-detail').textContent = detail;
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
</script>
</body>
</html>`;
}
