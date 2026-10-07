/**
 * Site designs: the tenant-selectable *layout/visual style* of their public
 * website, independent of the vertical (templates/registry.ts
 * VERTICAL_THEMES), which only supplies the accent color, emoji and default
 * hero copy. So a salon can run "elegant" in pink and a gym "bold" in red
 * without either side knowing about the other.
 *
 * The chosen key lives in `content.design` (draft_content -> live_content),
 * so switching design goes through the normal Save draft -> ?preview=1 ->
 * Publish flow and is covered by site_versions rollback.
 *
 * Every design shares the same markup and booking/concierge/PWA scripts in
 * registry.ts; a design is extra CSS scoped under `body.design-<key>` that
 * restyles it, plus an optional web font. Keeping it CSS-only means new
 * booking features land in every design at once.
 */
export type SiteDesignKey = "modern" | "elegant" | "bold" | "danfe";

export interface SiteDesign {
  key: SiteDesignKey;
  label: string;
  accent?: string;
  /** Google Fonts stylesheet URL, if the design uses a web font. */
  fontHref?: string;
  css: string;
}

const ELEGANT_CSS = `
  body.design-elegant { --cream: #faf6ef; --line: #e8e0d2; font-family: "Lato", -apple-system, system-ui, sans-serif; background: #fffdf9; }
  .design-elegant h1, .design-elegant h2, .design-elegant h3, .design-elegant nav .brand { font-family: "Playfair Display", Georgia, serif; }

  .design-elegant nav { background: rgba(255,253,249,0.92); border-bottom-color: var(--line); }
  .design-elegant nav .brand { font-weight: 700; font-size: 1.15rem; }
  .design-elegant nav .links a { text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.72rem; color: var(--ink); }
  .design-elegant nav .nav-book { border-radius: 4px; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.72rem; padding: 0.65rem 1.2rem; }

  .design-elegant header { background: var(--cream); color: var(--ink); text-align: left; padding: 4.5rem 1.5rem 4rem; border-bottom: 1px solid var(--line); }
  .design-elegant header::before, .design-elegant header::after { display: none; }
  .design-elegant header .inner { max-width: 860px; }
  .design-elegant .eyebrow { display: inline-flex; align-items: center; gap: 0.7rem; text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.72rem; font-weight: 700; color: var(--accent-dark); margin-bottom: 1.1rem; opacity: 0; animation: fadeInUp 0.6s ease forwards; }
  .design-elegant .eyebrow::before { content: ""; width: 36px; height: 1px; background: var(--accent); }
  .design-elegant .biz-logo { margin: 0 0 1.25rem; border-radius: 50%; box-shadow: none; border: 1px solid var(--line); }
  .design-elegant header h1 { font-size: clamp(2.2rem, 6.5vw, 3.6rem); font-weight: 600; line-height: 1.08; max-width: 14ch; }
  .design-elegant header p.hero-text { margin: 0; color: #57534e; font-size: 1.1rem; }
  .design-elegant .chips, .design-elegant header .cta-row { justify-content: flex-start; }
  .design-elegant .chip { background: transparent; border-color: var(--line); color: #44403c; border-radius: 4px; }
  .design-elegant .cta { background: var(--accent); color: #fff; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.78rem; padding: 0.95rem 1.7rem; }
  .design-elegant .cta.ghost { background: transparent; color: var(--ink); border: 1px solid var(--ink); }

  .design-elegant section { margin: 4.25rem 0; }
  .design-elegant h2 { font-size: 2rem; font-weight: 600; }
  .design-elegant h2::after { content: ""; display: block; width: 40px; height: 1px; background: var(--accent); margin: 0.9rem auto 0; }
  .design-elegant .subhead { font-style: italic; }

  .design-elegant .svc-grid { gap: 0; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); column-gap: 2.5rem; }
  .design-elegant .svc-card { border: none; border-bottom: 1px solid var(--line); border-radius: 0; padding: 1.4rem 0.25rem; }
  .design-elegant .svc-card:hover { transform: none; box-shadow: none; }
  .design-elegant .svc-card h3 { font-size: 1.2rem; font-weight: 600; }
  .design-elegant .svc-cat { letter-spacing: 0.16em; font-size: 0.66rem; }
  .design-elegant .svc-price { font-family: "Playfair Display", Georgia, serif; font-size: 1.2rem; color: var(--accent-dark); }
  .design-elegant .svc-book { width: auto; background: none; padding: 0; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.72rem; text-decoration: underline; text-underline-offset: 4px; }
  .design-elegant .svc-card:hover .svc-book { background: none; color: var(--accent-dark); }

  .design-elegant .gallery img { border-radius: 2px; }
  .design-elegant .testimonial { background: #fff; border: 1px solid var(--line); border-radius: 2px; padding: 1.8rem; }
  .design-elegant .testimonial p.quote { font-family: "Playfair Display", Georgia, serif; font-size: 1.08rem; color: var(--ink); line-height: 1.5; }
  .design-elegant .testimonial .who { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.7rem; }

  .design-elegant footer { background: var(--cream); border-top-color: var(--line); }
  .design-elegant .action-bar .book-btn, .design-elegant .action-bar .icon-btn, .design-elegant .modal button[type="submit"] { border-radius: 4px; }
  .design-elegant .modal { border-radius: 8px 8px 0 0; }
  @media (min-width: 560px) { .design-elegant .modal { border-radius: 8px; } }
  .design-elegant .modal h3 { font-size: 1.4rem; font-weight: 600; }
`;

const BOLD_CSS = `
  body.design-bold { --ink: #f8fafc; --muted: #94a3b8; --cream: #111827; --line: #1f2937; --surface: #0c111c; font-family: "Space Grotesk", -apple-system, system-ui, sans-serif; background: #05070d; color: var(--ink); }
  /* White surfaces keep the light palette so text stays readable on them. */
  .design-bold .modal, .design-bold .concierge-panel { --ink: #0f172a; --muted: #64748b; --cream: #f1f5f9; color: var(--ink); }
  .design-bold .install-banner { background: var(--cream); border: 1px solid var(--line); }

  .design-bold nav { background: rgba(5,7,13,0.85); border-bottom-color: var(--line); }
  .design-bold nav .brand { text-transform: uppercase; letter-spacing: 0.04em; }
  .design-bold nav .nav-book { border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em; }

  .design-bold header { text-align: left; padding: 5rem 1.5rem 4.5rem; background: radial-gradient(ellipse at 15% 0%, var(--accent) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, var(--accent-dark) 0%, transparent 50%), #05070d; border-bottom: 1px solid var(--line); }
  .design-bold header::before, .design-bold header::after { display: none; }
  .design-bold header .inner { max-width: 860px; }
  .design-bold .eyebrow { display: inline-block; background: var(--accent); color: #fff; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.72rem; font-weight: 700; padding: 0.35rem 0.7rem; border-radius: 4px; margin-bottom: 1.2rem; opacity: 0; animation: fadeInUp 0.6s ease forwards; }
  .design-bold .biz-logo { margin: 0 0 1.25rem; border-radius: 12px; }
  .design-bold header h1 { font-size: clamp(2.6rem, 9vw, 5rem); font-weight: 700; line-height: 0.98; letter-spacing: -0.03em; text-transform: uppercase; }
  .design-bold header p.hero-text { margin: 0.4rem 0 0; font-size: 1.15rem; color: #cbd5e1; }
  .design-bold .chips, .design-bold header .cta-row { justify-content: flex-start; }
  .design-bold .chip { border-radius: 6px; background: rgba(255,255,255,0.06); border-color: var(--line); }
  .design-bold .cta { background: var(--accent); color: #fff; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 4px 4px 0 #fff; }
  .design-bold .cta:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 #fff; }
  .design-bold .cta.ghost { background: transparent; border: 2px solid var(--ink); box-shadow: none; }

  .design-bold h2, .design-bold .subhead { text-align: left; }
  .design-bold h2 { font-size: clamp(1.8rem, 5vw, 2.5rem); text-transform: uppercase; letter-spacing: -0.02em; }

  .design-bold .svc-card { background: var(--surface); border: 2px solid var(--line); border-radius: 8px; }
  .design-bold .svc-card:hover { transform: translate(-3px, -3px); box-shadow: 6px 6px 0 var(--accent); border-color: var(--accent); }
  .design-bold .svc-price { font-size: 1.35rem; }
  .design-bold .svc-book { background: var(--accent); color: #fff; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em; }

  .design-bold .gallery img { border-radius: 6px; border: 2px solid var(--line); }
  .design-bold .testimonial { background: var(--surface); border: 2px solid var(--line); border-radius: 8px; }
  .design-bold .testimonial p.quote { color: #e2e8f0; font-style: normal; font-size: 1rem; }

  .design-bold footer { border-top-color: var(--line); }
  .design-bold footer .contact-line { color: #cbd5e1; }
  .design-bold .rebook-bar { border-bottom-color: var(--line); }
  .design-bold .rebook-bar .txt { color: #cbd5e1; }
  .design-bold .action-bar { background: #05070d; border-top-color: var(--line); }
  .design-bold .action-bar .icon-btn { background: var(--cream); border-color: var(--line); }
  .design-bold .action-bar .book-btn { border-radius: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .design-bold .concierge-fab { background: var(--accent); }
`;

export const SITE_DESIGNS: Record<SiteDesignKey, SiteDesign> = {
  danfe: { key: "danfe", label: "Our Danfe", accent: "#cd165b", css: `
    body.design-danfe{--accent:#cd165b;--accent-dark:#9f1248;--ink:#242359;--cream:#f6f5fc;--muted:#5d6076}
    .design-danfe nav{padding:1rem max(1.25rem,calc((100vw - 1120px)/2));border-bottom-color:#ecebf7}
    .design-danfe nav .brand img{border-radius:0;width:42px;height:38px;object-fit:contain}
    .design-danfe header{background:linear-gradient(130deg,#f5f3ff,#fff 65%);color:var(--ink);text-align:left;padding:4.5rem 1.5rem;border-bottom:1px solid #ede9f7}
    .design-danfe header:before,.design-danfe header:after{display:none}
    .design-danfe header .inner{max-width:1120px;display:grid;grid-template-columns:1.15fr .85fr;gap:3rem;align-items:center}
    .design-danfe header h1{font-size:clamp(2.5rem,5vw,4rem);letter-spacing:-.045em;line-height:1.05;max-width:18ch}
    .design-danfe .eyebrow{color:var(--accent);font-size:.78rem;text-transform:uppercase;letter-spacing:.12em;font-weight:800}
    .design-danfe header .hero-text{color:var(--muted);font-size:1.08rem;max-width:51ch}
    .design-danfe .chips,.design-danfe .cta-row{justify-content:flex-start}
    .design-danfe .chip{color:var(--ink);background:#eeebff;border-color:#e2def4}
    .design-danfe .cta.ghost{background:transparent;color:var(--ink);border-color:#bcb5d8}
    .design-danfe .danfe-hero-image{border:8px solid white;border-radius:24px;box-shadow:0 24px 60px #29245920;width:100%;height:auto;aspect-ratio:1;object-fit:contain;background:#fff}
    .design-danfe main{max-width:1120px}.design-danfe section{margin:3.5rem 0}.design-danfe h2{font-size:1.8rem;letter-spacing:-.035em}
    .design-danfe .svc-card{padding:1.8rem;border:1px solid #e6e2f1;box-shadow:0 8px 30px #29245907;border-radius:18px}
    .design-danfe .svc-price{font-size:1.8rem}.design-danfe .danfe-service-links{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
    .design-danfe .danfe-service-links a{padding:1.5rem;background:var(--cream);border:1px solid #e6e2f1;border-radius:16px;text-decoration:none;color:var(--ink);font-weight:700}
    .design-danfe .danfe-copy{max-width:780px;line-height:1.8}.design-danfe .danfe-faq details{border-bottom:1px solid #e6e2f1;padding:1rem 0}.design-danfe .danfe-faq summary{font-weight:700;cursor:pointer}.design-danfe footer{background:#27255c;color:white}.design-danfe footer .contact-line{color:#e1dff1}
    @media(max-width:740px){.design-danfe header{padding:2.5rem 1.2rem}.design-danfe header .inner{grid-template-columns:1fr;gap:2rem}.design-danfe .danfe-hero-image{max-width:440px}.design-danfe .danfe-service-links{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){.design-danfe *{animation:none!important;transition:none!important}.design-danfe .reveal{opacity:1;transform:none}}
  ` },
  // The original look — no overrides.
  modern: { key: "modern", label: "Modern", css: "" },
  elegant: {
    key: "elegant",
    label: "Elegant",
    fontHref: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&display=swap",
    css: ELEGANT_CSS,
  },
  bold: {
    key: "bold",
    label: "Bold",
    fontHref: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap",
    css: BOLD_CSS,
  },
};

/** Unknown/missing keys fall back to "modern", so old sites render unchanged. */
export function getDesign(key: string | undefined): SiteDesign {
  return key && Object.hasOwn(SITE_DESIGNS, key) ? SITE_DESIGNS[key as SiteDesignKey] : SITE_DESIGNS.modern;
}
