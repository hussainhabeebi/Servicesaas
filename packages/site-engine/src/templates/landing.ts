import { FAVICON_DATA_URI, LOGO_DATA_URI } from "../assets/logo";

/**
 * Marketing landing page for the bare apex domain (servbazaar.com), served
 * by site-engine as a special case before tenant host resolution runs —
 * see index.ts. Not tenant content, so it doesn't touch sites/draft_content
 * the way tenant pages do.
 *
 * Color theme is sampled from the ServBazaar mark (teal #036f71 + gold
 * #d2ad3a on cream) — see assets/logo.ts for the mark itself.
 *
 * Testimonials are deliberately left as clearly-marked placeholders, not
 * fabricated quotes — swap in real ones once there are real customers.
 */
const VERTICAL_OPTIONS: Array<{ value: string; label: string; emoji: string; anim: string }> = [
  { value: "cleaning", label: "Cleaning", emoji: "🧹", anim: "sweep" },
  { value: "salon", label: "Salon", emoji: "💇", anim: "snip" },
  { value: "repair", label: "Repair & Trades", emoji: "🔧", anim: "wrench" },
  { value: "tutoring", label: "Tutoring", emoji: "📚", anim: "flip" },
  { value: "pet_care", label: "Pet Care", emoji: "🐾", anim: "hop" },
  { value: "fitness", label: "Fitness", emoji: "🏋️", anim: "pulse" },
  { value: "spa_laundry", label: "Spa & Laundry", emoji: "🧺", anim: "float" },
  { value: "generic", label: "Other Service Business", emoji: "✨", anim: "pulse" },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is ServBazaar?",
    a: "ServBazaar is booking, billing, a website, and a WhatsApp bot for local service businesses — cleaning, salons, repair techs, tutors, pet groomers, fitness trainers, and spa & laundry — all in one place instead of five separate tools.",
  },
  {
    q: "How much does ServBazaar cost?",
    a: "Starter is AED 99/month (solo booking calendar, WhatsApp bot, basic invoicing, a website on your ServBazaar subdomain). Growth is AED 199/month and adds multi-staff scheduling, full VAT invoicing, a custom domain, full CRM, and Google Ads support. No setup fees, cancel anytime.",
  },
  {
    q: "Do I need my own WhatsApp Business number?",
    a: "Yes — you connect your own WhatsApp number during setup. Bookings, quotes, and reminders then run through that number, so it stays recognizably your business to your customers.",
  },
  {
    q: "Can I use my own domain name?",
    a: "Every business gets a free subdomain immediately on signup. On the Growth plan you can connect your own domain (e.g. yourbusiness.com) with automatic SSL.",
  },
  {
    q: "Is UAE VAT calculated automatically?",
    a: "Yes — invoices calculate 5% UAE VAT automatically, with support for multi-line items, partial payments, and automatic overdue reminders on the Growth plan.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Subscriptions are billed monthly with no lock-in — cancel anytime and access continues until the end of your current billing period.",
  },
];

function jsonLd(rootDomain: string): string {
  const softwareApp = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ServBazaar",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Booking, billing, a website, and a WhatsApp bot for local service businesses — cleaning, salons, repair, tutoring, pet care, fitness, and spa & laundry.",
    url: `https://${rootDomain}/`,
    offers: [
      { "@type": "Offer", name: "Starter", price: "99", priceCurrency: "AED", url: `https://${rootDomain}/#pricing` },
      { "@type": "Offer", name: "Growth", price: "199", priceCurrency: "AED", url: `https://${rootDomain}/#pricing` },
    ],
  };
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ServBazaar",
    url: `https://${rootDomain}/`,
    logo: `https://${rootDomain}/logo.png`,
    sameAs: ["https://aiingo.com"],
  };
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return [softwareApp, organization, faqPage].map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`).join("\n");
}

export function renderLandingPage(apiBaseUrl: string, rootDomain: string): string {
  const canonicalUrl = `https://${rootDomain}/`;
  const description =
    "Booking, billing, a website, and a WhatsApp bot for local service businesses — cleaning, salons, repair, tutoring, pet care, fitness, spa & laundry. Starter AED 99, Growth AED 199.";
  // Hero typewriter cycles the verticals list — one source of truth with the signup form's own options.
  const heroWords = VERTICAL_OPTIONS.filter((v) => v.value !== "generic").map((v) => v.label);
  const heroWordsJson = JSON.stringify(heroWords);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>ServBazaar — The Operating System for Service Companies</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${canonicalUrl}" />
<link rel="icon" type="image/png" href="${FAVICON_DATA_URI}" />
<meta name="theme-color" content="#036f71" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="ServBazaar" />
<meta property="og:title" content="ServBazaar — The Operating System for Service Companies" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:locale" content="en_AE" />
<meta property="og:image" content="https://${rootDomain}/og-image.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="ServBazaar — The Operating System for Service Companies" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="https://${rootDomain}/og-image.jpg" />
${jsonLd(rootDomain)}
<style>
  :root { --accent: #036f71; --accent-dark: #024f50; --gold: #d2ad3a; --gold-dark: #a8842a; --ink: #0d2b2b; --muted: #5b6b6a; --cream: #f7f6ec; }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; color: var(--ink); background: #fff; overflow-x: hidden; }

  nav { position: sticky; top: 0; z-index: 50; display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; background: rgba(255,255,255,0.85); backdrop-filter: blur(8px); border-bottom: 1px solid #f0f0f2; transition: box-shadow 0.2s; }
  nav.scrolled { box-shadow: 0 2px 12px rgba(0,0,0,0.06); }
  nav .brand { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 800; font-size: 1.1rem; color: var(--ink); text-decoration: none; }
  nav .brand img { border-radius: 7px; display: block; }
  nav .links { display: flex; align-items: center; gap: 1.5rem; }
  nav .links a.nav-link { color: var(--muted); text-decoration: none; font-size: 0.92rem; display: none; }
  nav button.login { background: none; border: 1px solid #d1d5db; padding: 0.5rem 1.1rem; border-radius: 999px; font-weight: 600; font-size: 0.88rem; cursor: pointer; }
  nav a.nav-cta { background: var(--ink); color: #fff; padding: 0.55rem 1.2rem; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 0.88rem; }
  nav button.hamburger { display: inline-flex; align-items: center; justify-content: center; background: none; border: none; font-size: 1.4rem; cursor: pointer; width: 44px; height: 44px; }
  @media (min-width: 720px) { nav .links a.nav-link { display: inline; } nav button.hamburger { display: none; } }
  @media (max-width: 719px) { nav .links button.login, nav .links a.nav-cta { display: none; } }

  .mobile-menu { position: fixed; top: 60px; left: 0; right: 0; background: #fff; border-bottom: 1px solid #f0f0f2; box-shadow: 0 12px 24px rgba(0,0,0,0.08); z-index: 49; padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: 0.9rem; transform: translateY(-10px); opacity: 0; visibility: hidden; transition: transform 0.22s ease, opacity 0.22s ease, visibility 0.22s; }
  .mobile-menu.open { transform: translateY(0); opacity: 1; visibility: visible; }
  .mobile-menu a { color: var(--ink); text-decoration: none; font-size: 0.98rem; font-weight: 600; padding: 0.4rem 0; min-height: 44px; display: flex; align-items: center; }
  .mobile-menu a.mobile-cta { background: var(--accent); color: #fff; border-radius: 999px; padding: 0 1.2rem; justify-content: center; margin-top: 0.2rem; }
  @media (min-width: 720px) { .mobile-menu { display: none !important; } }

  header { position: relative; padding: 5rem 1.5rem 4rem; text-align: center; background: linear-gradient(135deg, var(--accent), var(--accent-dark), var(--ink)); background-size: 200% 200%; animation: gradientShift 12s ease infinite; color: #fff; overflow: hidden; }
  @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
  header::before, header::after { content: ""; position: absolute; border-radius: 50%; filter: blur(60px); opacity: 0.35; animation: floatBlob 10s ease-in-out infinite; }
  header::before { width: 280px; height: 280px; background: #fff; top: -80px; left: -60px; }
  header::after { width: 220px; height: 220px; background: var(--gold); bottom: -80px; right: -40px; animation-delay: -4s; }
  @keyframes floatBlob { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-24px) scale(1.08); } }
  header .inner { position: relative; z-index: 1; }
  .hero-grid { display: grid; grid-template-columns: 1fr; align-items: center; gap: 2.5rem; text-align: center; }
  @media (min-width: 900px) { .hero-grid { grid-template-columns: 1.15fr 0.85fr; text-align: left; } }
  header h1 { margin: 0 0 0.75rem; font-size: clamp(1.9rem, 5vw, 3rem); font-weight: 800; opacity: 0; animation: fadeInUp 0.7s ease forwards; }
  .tw-cursor { display: inline-block; font-weight: 300; animation: blink 0.9s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  header p { max-width: 640px; margin: 0 auto; font-size: 1.15rem; opacity: 0; animation: fadeInUp 0.7s ease 0.15s forwards; }
  @media (min-width: 900px) { header p { margin: 0; } }
  header .cta-row { margin-top: 2rem; opacity: 0; animation: fadeInUp 0.7s ease 0.3s forwards; }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
  .cta { display: inline-block; padding: 0.95rem 1.9rem; background: #fff; color: var(--accent); border-radius: 999px; text-decoration: none; font-weight: 700; transition: transform 0.2s, box-shadow 0.2s; }
  .cta:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(0,0,0,0.18); }
  .cta.ghost { background: transparent; color: #fff; border: 2px solid rgba(255,255,255,0.6); margin-left: 0.75rem; }
  .cta.dark { background: var(--ink); color: #fff; }
  @media (max-width: 480px) { header .cta-row { display: flex; flex-direction: column; gap: 0.7rem; } header .cta-row .cta { width: 100%; text-align: center; margin-left: 0; } }

  .hero-visual { display: flex; justify-content: center; opacity: 0; animation: fadeInUp 0.7s ease 0.45s forwards; }
  .phone-wrap { display: flex; flex-direction: column; align-items: center; }
  .phone { position: relative; width: 220px; aspect-ratio: 9 / 19; background: var(--ink); border-radius: 34px; padding: 10px; box-shadow: 0 30px 60px rgba(0,0,0,0.35), inset 0 0 0 2px rgba(255,255,255,0.08); }
  .phone-screen { position: relative; width: 100%; height: 100%; background: #fff; border-radius: 24px; overflow: hidden; }
  .slide { position: absolute; inset: 0; opacity: 0; transform: translateX(10px); transition: opacity 0.4s ease, transform 0.4s ease; padding: 1rem 0.85rem; color: var(--ink); text-align: left; }
  .slide.active { opacity: 1; transform: translateX(0); }
  .slide .s-title { font-weight: 800; font-size: 0.82rem; margin-bottom: 0.7rem; }
  .s-card { background: var(--cream); border-radius: 10px; padding: 0.5rem 0.6rem; margin-bottom: 0.5rem; display: flex; flex-direction: column; gap: 2px; }
  .s-time { font-weight: 700; font-size: 0.72rem; color: var(--accent); }
  .s-name { font-size: 0.68rem; color: #374151; }
  .s-badge { align-self: flex-start; font-size: 0.6rem; font-weight: 700; padding: 2px 7px; border-radius: 99px; color: #fff; margin-top: 2px; }
  .s-badge-teal { background: var(--accent); }
  .s-badge-green { background: #16a34a; }
  .s-bubble { max-width: 88%; padding: 0.4rem 0.6rem; border-radius: 12px; margin-bottom: 0.4rem; font-size: 0.66rem; line-height: 1.35; }
  .s-bubble-in { background: var(--cream); color: #111; border-bottom-left-radius: 3px; }
  .s-bubble-out { background: var(--accent); color: #fff; margin-left: auto; border-bottom-right-radius: 3px; }
  .s-line { display: flex; justify-content: space-between; font-size: 0.68rem; padding: 0.3rem 0; border-bottom: 1px dashed #e5e7eb; }
  .s-total { font-weight: 800; border-bottom: none; margin-top: 0.2rem; }
  .phone-dots { display: flex; justify-content: center; gap: 6px; margin-top: 1rem; }
  .phone-dots .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.35); transition: background 0.3s, transform 0.3s; }
  .phone-dots .dot.active { background: #fff; transform: scale(1.3); }
  @media (max-width: 899px) { .phone { width: 180px; } }

  main { max-width: 1040px; margin: 0 auto; padding: 0 1.5rem; }
  section { margin: 5rem 0; }
  h2 { text-align: center; font-size: 1.8rem; margin-bottom: 0.5rem; }
  .subhead { text-align: center; color: var(--muted); margin-bottom: 2.5rem; }
  @media (max-width: 719px) { header { padding: 3rem 1.25rem 2.5rem; } section { margin: 3.25rem 0; } }

  .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
  .reveal.visible { opacity: 1; transform: translateY(0); }

  .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; }
  .feature { border: 1px solid #e5e7eb; border-radius: 14px; padding: 1.6rem; transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s; }
  .feature:hover { transform: translateY(-4px); box-shadow: 0 12px 28px rgba(3,111,113,0.14); border-color: var(--accent); }
  .feature .emoji { font-size: 1.6rem; margin-bottom: 0.5rem; display: inline-block; animation: bob 3.2s ease-in-out infinite; }
  .feature:nth-child(2) .emoji { animation-delay: 0.4s; }
  .feature:nth-child(3) .emoji { animation-delay: 0.8s; }
  .feature:nth-child(4) .emoji { animation-delay: 1.2s; }
  @keyframes bob { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-6px) rotate(-4deg); } }
  .feature h3 { margin: 0 0 0.4rem; font-size: 1.05rem; }
  .feature p { margin: 0; color: var(--muted); font-size: 0.92rem; }

  .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.25rem; position: relative; }
  .steps::before { content: ""; position: absolute; top: 28px; left: 12%; right: 12%; height: 2px; background: repeating-linear-gradient(90deg, #d1d5db 0 8px, transparent 8px 16px); z-index: 0; }
  @media (max-width: 720px) { .steps { grid-template-columns: 1fr; } .steps::before { display: none; } }
  .step { position: relative; z-index: 1; text-align: center; opacity: 0; transform: translateY(16px); transition: opacity 0.5s ease, transform 0.5s ease; }
  .step.visible { opacity: 1; transform: translateY(0); }
  .step .num { width: 56px; height: 56px; border-radius: 50%; background: #fff; border: 2px solid var(--accent); color: var(--accent); font-weight: 800; font-size: 1.3rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.9rem; transition: transform 0.3s, background 0.3s, color 0.3s; }
  .step:hover .num { transform: scale(1.12); background: var(--accent); color: #fff; }
  .step h3 { font-size: 0.98rem; margin: 0 0 0.35rem; }
  .step p { font-size: 0.85rem; color: var(--muted); margin: 0; }

  .verticals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
  .vcard { background: var(--cream); border: 1px solid #e5e7eb; border-radius: 16px; padding: 1.5rem 1rem; text-align: center; transition: transform 0.25s, box-shadow 0.25s, background 0.25s; cursor: default; }
  .vcard:hover { transform: translateY(-6px) scale(1.03); box-shadow: 0 14px 30px rgba(3,111,113,0.18); background: #e3f1f0; }
  .vcard .vemoji { font-size: 2.2rem; display: inline-block; margin-bottom: 0.6rem; }
  .vcard .vlabel { font-size: 0.88rem; font-weight: 600; color: var(--ink); }
  .vcard:hover .vemoji.sweep { animation: sweep 0.6s ease-in-out infinite; }
  .vcard:hover .vemoji.snip { animation: snip 0.5s ease-in-out infinite; }
  .vcard:hover .vemoji.wrench { animation: wrench 0.6s ease-in-out infinite; }
  .vcard:hover .vemoji.flip { animation: flip 0.7s ease-in-out infinite; }
  .vcard:hover .vemoji.hop { animation: hop 0.5s ease-in-out infinite; }
  .vcard:hover .vemoji.pulse { animation: vpulse 0.6s ease-in-out infinite; }
  .vcard:hover .vemoji.float { animation: vfloat 1.4s ease-in-out infinite; }
  @keyframes sweep { 0%, 100% { transform: rotate(0deg) translateX(0); } 50% { transform: rotate(-18deg) translateX(-4px); } }
  @keyframes snip { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(22deg); } }
  @keyframes wrench { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(12deg); } }
  @keyframes flip { 0%, 100% { transform: rotateY(0deg); } 50% { transform: rotateY(180deg); } }
  @keyframes hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  @keyframes vpulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.22); } }
  @keyframes vfloat { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-8px) rotate(6deg); } }

  .pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
  .plan { border: 2px solid #e5e7eb; border-radius: 18px; padding: 2rem; transition: transform 0.25s, box-shadow 0.25s; }
  .plan:hover { transform: translateY(-6px); box-shadow: 0 16px 32px rgba(0,0,0,0.08); }
  .plan.growth { border-color: var(--gold-dark); position: relative; }
  .plan .badge { position: absolute; top: -0.8rem; right: 1.5rem; background: var(--gold); color: var(--ink); padding: 0.3rem 0.8rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
  .plan h3 { margin: 0 0 0.25rem; font-size: 1.1rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .plan .price { font-size: 2.25rem; font-weight: 800; margin: 0.25rem 0 1.25rem; }
  .plan .price span { font-size: 1rem; font-weight: 500; color: var(--muted); }
  .plan ul { list-style: none; padding: 0; margin: 0 0 1.5rem; }
  .plan li { padding: 0.4rem 0; color: #374151; font-size: 0.94rem; }
  .plan li::before { content: "✓ "; color: var(--accent); font-weight: 700; }
  .plan.growth li::before { color: var(--gold-dark); }
  .plan button { width: 100%; padding: 0.9rem; border-radius: 10px; border: none; background: var(--accent); color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; transition: opacity 0.2s; }
  .plan button:hover { opacity: 0.9; }
  .plan.growth button { background: var(--gold); color: var(--ink); }

  .testimonials { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem; }
  .testimonial { background: var(--cream); border-radius: 14px; padding: 1.5rem; border: 1px dashed #d1d5db; }
  .testimonial .stars { color: var(--gold-dark); margin-bottom: 0.5rem; }
  .testimonial p.quote { color: #374151; font-style: italic; margin: 0 0 0.75rem; }
  .testimonial .who { font-size: 0.85rem; color: var(--muted); }
  .testimonial-note { text-align: center; color: var(--muted); font-size: 0.82rem; margin-top: 1.5rem; }

  .faq { max-width: 720px; margin: 0 auto; }
  .faq details { border-bottom: 1px solid #e5e7eb; padding: 1.1rem 0; }
  .faq summary { cursor: pointer; font-weight: 700; font-size: 1rem; list-style: none; display: flex; justify-content: space-between; align-items: center; }
  .faq summary::-webkit-details-marker { display: none; }
  .faq summary::after { content: "+"; font-size: 1.3rem; color: var(--accent); transition: transform 0.2s; }
  .faq details[open] summary::after { transform: rotate(45deg); }
  .faq p { color: var(--muted); margin: 0.75rem 0 0; font-size: 0.94rem; line-height: 1.6; }

  #signup { background: var(--cream); border-radius: 22px; padding: 2.5rem; }
  #signup form { max-width: 480px; margin: 0 auto; display: grid; gap: 0.9rem; }
  #signup label { font-size: 0.85rem; font-weight: 600; color: #374151; display: block; margin-bottom: 0.3rem; }
  #signup input, #signup select { width: 100%; padding: 0.7rem 0.9rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; }
  #signup button[type="submit"] { padding: 0.95rem; border-radius: 10px; border: none; background: var(--accent); color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; margin-top: 0.5rem; }
  #signup-result { max-width: 480px; margin: 1rem auto 0; text-align: center; font-size: 0.95rem; }
  #signup-result.error { color: #b91c1c; }
  #signup-result.success { color: #15803d; }

  .final-cta { text-align: center; background: linear-gradient(135deg, var(--accent), var(--accent-dark)); border-radius: 24px; padding: 3.5rem 1.5rem; color: #fff; }
  .final-cta h2 { color: #fff; }
  .final-cta p { color: rgba(255,255,255,0.9); max-width: 480px; margin: 0 auto 1.75rem; }

  footer { text-align: center; padding: 3rem 1.5rem 5.5rem; color: var(--muted); font-size: 0.85rem; border-top: 1px solid #f0f0f2; }
  footer .footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 1.25rem; margin-bottom: 1rem; }
  footer .footer-links a { color: var(--muted); text-decoration: none; }
  footer .footer-links a:hover { color: var(--ink); }
  footer .by { font-size: 0.82rem; }
  footer .by a { color: var(--accent); text-decoration: none; font-weight: 600; }

  .sticky-cta { display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 60; background: #fff; border-top: 1px solid #e5e7eb; padding: 0.8rem 1.2rem; padding-bottom: max(0.8rem, env(safe-area-inset-bottom)); box-shadow: 0 -6px 20px rgba(0,0,0,0.08); align-items: center; justify-content: space-between; gap: 1rem; transform: translateY(100%); transition: transform 0.3s ease; }
  .sticky-cta.show { transform: translateY(0); }
  .sticky-cta span { font-weight: 700; font-size: 0.9rem; }
  @media (max-width: 719px) { .sticky-cta { display: flex; } }

  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(17,24,39,0.55); z-index: 100; align-items: center; justify-content: center; padding: 1.5rem; }
  .modal-overlay.open { display: flex; }
  .modal { background: #fff; border-radius: 16px; padding: 2rem; width: 100%; max-width: 380px; position: relative; animation: fadeInUp 0.25s ease; }
  .modal h3 { margin-top: 0; }
  .modal label { font-size: 0.85rem; font-weight: 600; color: #374151; display: block; margin-bottom: 0.3rem; margin-top: 0.8rem; }
  .modal input { width: 100%; padding: 0.7rem 0.9rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; }
  .modal button[type="submit"] { width: 100%; margin-top: 1.25rem; padding: 0.9rem; border-radius: 10px; border: none; background: var(--accent); color: #fff; font-weight: 700; cursor: pointer; }
  .modal .close { position: absolute; top: 0.9rem; right: 1rem; border: none; background: none; font-size: 1.3rem; cursor: pointer; color: var(--muted); }
  .modal-result { margin-top: 0.9rem; font-size: 0.9rem; text-align: center; }
  .modal-result.error { color: #b91c1c; }
  .modal-result.success { color: #15803d; }
</style>
</head>
<body>

<nav id="navbar">
  <a class="brand" href="/"><img src="${LOGO_DATA_URI}" alt="" width="28" height="28" />ServBazaar</a>
  <div class="links">
    <a class="nav-link" href="#features">Features</a>
    <a class="nav-link" href="#how-it-works">How it works</a>
    <a class="nav-link" href="#pricing">Pricing</a>
    <a class="nav-link" href="#faq">FAQ</a>
    <button class="login" type="button" onclick="openLogin()">Log in</button>
    <a class="nav-cta" href="#signup">Get Started</a>
    <button class="hamburger" type="button" onclick="toggleMobileMenu()" aria-label="Menu">☰</button>
  </div>
</nav>
<div class="mobile-menu" id="mobile-menu">
  <a href="#features" onclick="closeMobileMenu()">Features</a>
  <a href="#how-it-works" onclick="closeMobileMenu()">How it works</a>
  <a href="#pricing" onclick="closeMobileMenu()">Pricing</a>
  <a href="#faq" onclick="closeMobileMenu()">FAQ</a>
  <a href="#" onclick="closeMobileMenu(); openLogin(); return false;">Log in</a>
  <a class="mobile-cta" href="#signup" onclick="closeMobileMenu()">Get Started</a>
</div>

<header>
  <div class="inner hero-grid">
    <div class="hero-copy">
      <h1>The Operating System for <span class="tw-word" id="tw-word">${heroWords[0]}</span><span class="tw-cursor">|</span> Businesses</h1>
      <p>Booking, billing, a website, and a WhatsApp bot — all in one place, built for cleaning, salons, repair, tutoring, pet care, fitness, and spa &amp; laundry businesses.</p>
      <div class="cta-row">
        <a class="cta" href="#signup">Get Started Free</a>
        <a class="cta ghost" href="#pricing">See pricing</a>
      </div>
    </div>
    <div class="hero-visual">
      <div class="phone-wrap">
        <div class="phone">
          <div class="phone-screen">
            <div class="slide active">
              <div class="s-title">📅 Today</div>
              <div class="s-card"><span class="s-time">10:00</span><span class="s-name">Aisha M. — Deep clean</span><span class="s-badge s-badge-teal">Scheduled</span></div>
              <div class="s-card"><span class="s-time">14:30</span><span class="s-name">Omar R. — Standard clean</span><span class="s-badge s-badge-green">Done</span></div>
            </div>
            <div class="slide">
              <div class="s-title">💬 WhatsApp</div>
              <div class="s-bubble s-bubble-in">Hi! Looking for a deep clean this Friday</div>
              <div class="s-bubble s-bubble-out">Sure! 2-bed apt starts at AED 180. What time works?</div>
              <div class="s-bubble s-bubble-in">3pm please</div>
              <div class="s-bubble s-bubble-out">✅ You're booked for Friday 3pm!</div>
            </div>
            <div class="slide">
              <div class="s-title">🧾 Invoice #1042</div>
              <div class="s-line"><span>Deep clean (2-bed)</span><span>AED 180.00</span></div>
              <div class="s-line"><span>VAT (5%)</span><span>AED 9.00</span></div>
              <div class="s-line s-total"><span>Total</span><span>AED 189.00</span></div>
              <div class="s-badge s-badge-green">Paid</div>
            </div>
          </div>
        </div>
        <div class="phone-dots">
          <span class="dot active"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>
    </div>
  </div>
</header>

<main>
  <section id="features" class="reveal">
    <h2>Everything your business needs</h2>
    <p class="subhead">No separate booking app, invoicing tool, website builder, or WhatsApp number to juggle.</p>
    <div class="features">
      <div class="feature"><div class="emoji">📅</div><h3>Booking calendar</h3><p>Multi-staff or solo, recurring jobs, reminders, and no double-bookings.</p></div>
      <div class="feature"><div class="emoji">💬</div><h3>WhatsApp bot</h3><p>Customers book straight from WhatsApp — enquiry, quote, and confirmation, automatically.</p></div>
      <div class="feature"><div class="emoji">🧾</div><h3>Invoicing &amp; VAT</h3><p>Quote to invoice, UAE VAT handled, payment links, and auto-reminders for overdue bills.</p></div>
      <div class="feature"><div class="emoji">🌐</div><h3>Your own website</h3><p>A booking-ready site on your own subdomain — or your own domain on Growth.</p></div>
    </div>
  </section>

  <section id="how-it-works" class="reveal">
    <h2>Up and running in minutes</h2>
    <p class="subhead">No developer, no setup call — just sign up and go.</p>
    <div class="steps">
      <div class="step"><div class="num">1</div><h3>Sign up</h3><p>Tell us your business type and services — takes about 2 minutes.</p></div>
      <div class="step"><div class="num">2</div><h3>Connect WhatsApp</h3><p>Link your own WhatsApp number — customers keep messaging the number they know.</p></div>
      <div class="step"><div class="num">3</div><h3>Customers book</h3><p>Via WhatsApp or your new website — automatically, no back-and-forth.</p></div>
      <div class="step"><div class="num">4</div><h3>Get paid</h3><p>Invoices, VAT, and payment links are handled for you.</p></div>
    </div>
  </section>

  <section id="verticals" class="reveal">
    <h2>Built for your kind of business</h2>
    <p class="subhead">Hover a card and see it come to life.</p>
    <div class="verticals">
      ${VERTICAL_OPTIONS.filter((v) => v.value !== "generic")
        .map((v) => `<div class="vcard"><div class="vemoji ${v.anim}">${v.emoji}</div><div class="vlabel">${v.label}</div></div>`)
        .join("")}
    </div>
  </section>

  <section id="pricing" class="reveal">
    <h2>Simple pricing</h2>
    <p class="subhead">No setup fees. Cancel anytime.</p>
    <div class="pricing">
      <div class="plan starter">
        <h3>Starter</h3>
        <div class="price">AED 99<span>/month</span></div>
        <ul>
          <li>Solo booking calendar</li>
          <li>WhatsApp enquiry &amp; auto-booking bot</li>
          <li>Basic invoicing with WhatsApp/PDF send</li>
          <li>Website on your ServBazaar subdomain</li>
          <li>1 payment gateway</li>
        </ul>
        <button type="button" onclick="selectPlan('starter')">Start with Starter</button>
      </div>
      <div class="plan growth">
        <span class="badge">Most popular</span>
        <h3>Growth</h3>
        <div class="price">AED 199<span>/month</span></div>
        <ul>
          <li>Everything in Starter, plus:</li>
          <li>Multi-staff calendar &amp; recurring bookings</li>
          <li>Full invoicing: VAT, partial payments, auto-reminders</li>
          <li>Custom domain &amp; full website management</li>
          <li>Full CRM, multiple payment gateways</li>
          <li>Google Ads support &amp; staff analytics</li>
        </ul>
        <button type="button" onclick="selectPlan('growth')">Start with Growth</button>
      </div>
    </div>
  </section>

  <section id="testimonials" class="reveal">
    <h2>Loved by service businesses</h2>
    <p class="subhead">We're just getting started — here's the kind of feedback we're building toward.</p>
    <div class="testimonials">
      <div class="testimonial">
        <div class="stars">★★★★★</div>
        <p class="quote">"[Your customer's quote goes here once you have your first few reviews.]"</p>
        <div class="who">— [Business name], [City]</div>
      </div>
      <div class="testimonial">
        <div class="stars">★★★★★</div>
        <p class="quote">"[Your customer's quote goes here once you have your first few reviews.]"</p>
        <div class="who">— [Business name], [City]</div>
      </div>
      <div class="testimonial">
        <div class="stars">★★★★★</div>
        <p class="quote">"[Your customer's quote goes here once you have your first few reviews.]"</p>
        <div class="who">— [Business name], [City]</div>
      </div>
    </div>
    <p class="testimonial-note">Placeholder cards — swap in real customer quotes as they come in.</p>
  </section>

  <section id="faq" class="reveal">
    <h2>Frequently asked questions</h2>
    <div class="faq">
      ${FAQS.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("")}
    </div>
  </section>

  <section id="signup" class="reveal">
    <h2>Get started in minutes</h2>
    <p class="subhead">Tell us about your business — we'll set up your calendar, invoicing, and website instantly.</p>
    <form id="signup-form">
      <div>
        <label for="businessName">Business name</label>
        <input id="businessName" name="businessName" required minlength="2" maxlength="120" />
      </div>
      <div>
        <label for="vertical">What kind of business?</label>
        <select id="vertical" name="vertical" required>
          ${VERTICAL_OPTIONS.map((v) => `<option value="${v.value}">${v.label}</option>`).join("")}
        </select>
      </div>
      <div>
        <label for="ownerName">Your name</label>
        <input id="ownerName" name="ownerName" required minlength="2" maxlength="120" />
      </div>
      <div>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" required />
      </div>
      <div>
        <label for="phone">Phone (with country code)</label>
        <input id="phone" name="phone" required placeholder="+971501234567" />
      </div>
      <div>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" required minlength="8" />
      </div>
      <div>
        <label for="staffCount">Number of staff (including you)</label>
        <input id="staffCount" name="staffCount" type="number" min="1" max="200" value="1" required />
      </div>
      <input type="hidden" id="plan" name="plan" value="starter" />
      <button type="submit">Create my account</button>
    </form>
    <div id="signup-result"></div>
  </section>

  <section class="final-cta reveal">
    <h2>Ready to run your business on WhatsApp?</h2>
    <p>Set up your booking calendar, invoicing, and website in the next five minutes.</p>
    <a class="cta dark" href="#signup">Get Started Free</a>
  </section>
</main>

<footer>
  <div class="footer-links">
    <a href="/#features">Features</a>
    <a href="/#pricing">Pricing</a>
    <a href="/#faq">FAQ</a>
    <a href="/privacy">Privacy Policy</a>
    <a href="/terms">Terms of Service</a>
    <a href="https://admin.${rootDomain}">Admin</a>
  </div>
  <div class="by">A product by <a href="https://aiingo.com" target="_blank" rel="noopener">Aiingo</a></div>
</footer>

<div class="sticky-cta" id="sticky-cta">
  <span>Ready to get started?</span>
  <a class="cta" style="background: var(--accent); color: #fff; padding: 0.6rem 1.1rem; font-size: 0.85rem;" href="#signup">Get Started</a>
</div>

<div class="modal-overlay" id="login-overlay">
  <div class="modal">
    <button class="close" type="button" onclick="closeLogin()" aria-label="Close">&times;</button>
    <h3>Log in</h3>
    <form id="login-form">
      <label for="login-identifier">Email or phone</label>
      <input id="login-identifier" name="identifier" required />
      <label for="login-password">Password</label>
      <input id="login-password" name="password" type="password" required />
      <button type="submit">Log in</button>
    </form>
    <div class="modal-result" id="login-result"></div>
  </div>
</div>

<script>
  var API_BASE = ${JSON.stringify(apiBaseUrl)};
  var APP_BASE = ${JSON.stringify(`https://app.${rootDomain}`)};

  // Hero headline typewriter — cycles the verticals list. The word is
  // already fully shown server-side (twEl's initial textContent) so there's
  // no flash of empty text before JS loads; this just takes over from there.
  (function () {
    var words = ${heroWordsJson};
    var twEl = document.getElementById('tw-word');
    if (!twEl || words.length < 2) return;
    var wordIndex = 0, charIndex = words[0].length, deleting = false;
    function step() {
      var word = words[wordIndex];
      if (!deleting) {
        charIndex++;
        if (charIndex > word.length) { deleting = true; setTimeout(step, 1500); return; }
        twEl.textContent = word.slice(0, charIndex);
        setTimeout(step, 75);
      } else {
        charIndex--;
        if (charIndex < 0) { deleting = false; wordIndex = (wordIndex + 1) % words.length; charIndex = 0; setTimeout(step, 300); return; }
        twEl.textContent = word.slice(0, charIndex);
        setTimeout(step, 40);
      }
    }
    setTimeout(step, 1800);
  })();

  // Compact "app" slideshow in the hero phone mockup
  (function () {
    var slides = document.querySelectorAll('.phone-screen .slide');
    var dots = document.querySelectorAll('.phone-dots .dot');
    if (!slides.length) return;
    var i = 0;
    setInterval(function () {
      slides[i].classList.remove('active');
      dots[i].classList.remove('active');
      i = (i + 1) % slides.length;
      slides[i].classList.add('active');
      dots[i].classList.add('active');
    }, 3200);
  })();

  // Scroll-reveal animations (sections + step cards individually)
  var revealEls = document.querySelectorAll('.reveal, .step');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(function (el) { observer.observe(el); });

  // Stagger the 4 step cards
  document.querySelectorAll('.step').forEach(function (el, i) {
    el.style.transitionDelay = (i * 0.12) + 's';
  });

  // Nav shadow + sticky mobile CTA on scroll
  var navbar = document.getElementById('navbar');
  var stickyCta = document.getElementById('sticky-cta');
  var heroHeight = document.querySelector('header').offsetHeight;
  window.addEventListener('scroll', function () {
    if (window.scrollY > 8) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
    if (window.scrollY > heroHeight) stickyCta.classList.add('show');
    else stickyCta.classList.remove('show');
  });

  function toggleMobileMenu() {
    document.getElementById('mobile-menu').classList.toggle('open');
  }
  function closeMobileMenu() {
    document.getElementById('mobile-menu').classList.remove('open');
  }

  function selectPlan(plan) {
    document.getElementById('plan').value = plan;
    document.getElementById('signup').scrollIntoView({ behavior: 'smooth' });
  }

  function openLogin() {
    document.getElementById('login-overlay').classList.add('open');
  }
  function closeLogin() {
    document.getElementById('login-overlay').classList.remove('open');
  }
  document.getElementById('login-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeLogin();
  });

  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var resultEl = document.getElementById('login-result');
    var submitBtn = form.querySelector('button[type="submit"]');
    resultEl.className = 'modal-result';
    resultEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';

    fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: form.identifier.value, password: form.password.value }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          resultEl.className = 'modal-result error';
          resultEl.textContent = 'Invalid email/phone or password.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Log in';
          return;
        }
        resultEl.className = 'modal-result success';
        resultEl.textContent = 'Logged in! Redirecting to your dashboard…';
        setTimeout(function () {
          window.location.href = APP_BASE + '/?token=' + encodeURIComponent(result.data.accessToken);
        }, 900);
      })
      .catch(function () {
        resultEl.className = 'modal-result error';
        resultEl.textContent = 'Could not reach the server — please try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log in';
      });
  });

  document.getElementById('signup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var resultEl = document.getElementById('signup-result');
    var submitBtn = form.querySelector('button[type="submit"]');
    resultEl.className = '';
    resultEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Setting up your account…';

    var payload = {
      businessName: form.businessName.value,
      vertical: form.vertical.value,
      ownerName: form.ownerName.value,
      email: form.email.value,
      phone: form.phone.value,
      password: form.password.value,
      staffCount: Number(form.staffCount.value),
      plan: form.plan.value,
    };

    fetch(API_BASE + '/onboarding/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      })
      .then(function (result) {
        if (!result.ok) {
          resultEl.className = 'error';
          resultEl.textContent = 'Something went wrong — please check your details and try again.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create my account';
          return;
        }
        resultEl.className = 'success';
        resultEl.textContent = "You're all set! Your site is live at " + result.data.tenant.subdomain + ". Taking you to your dashboard…";
        form.reset();
        submitBtn.textContent = 'Account created';
        setTimeout(function () {
          window.location.href = APP_BASE + '/?token=' + encodeURIComponent(result.data.accessToken);
        }, 1400);
      })
      .catch(function () {
        resultEl.className = 'error';
        resultEl.textContent = 'Could not reach the server — please try again in a moment.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create my account';
      });
  });
</script>
</body>
</html>`;
}
