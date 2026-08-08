/**
 * Marketing landing page for the bare apex domain (servbazaar.com), served
 * by site-engine as a special case before tenant host resolution runs —
 * see index.ts. Not tenant content, so it doesn't touch sites/draft_content
 * the way tenant pages do.
 */
const VERTICAL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "cleaning", label: "Cleaning" },
  { value: "salon", label: "Salon" },
  { value: "repair", label: "Repair & Trades" },
  { value: "tutoring", label: "Tutoring" },
  { value: "pet_care", label: "Pet Care" },
  { value: "fitness", label: "Fitness" },
  { value: "spa_laundry", label: "Spa & Laundry" },
  { value: "generic", label: "Other Service Business" },
];

export function renderLandingPage(apiBaseUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ServBazaar — The Operating System for Service Companies</title>
<meta name="description" content="Booking, billing, a website, and a WhatsApp bot for local service businesses — cleaning, salons, repair, tutoring, pet care, fitness, spa & laundry. Starter AED 99, Growth AED 199." />
<style>
  :root { --accent: #4F46E5; --ink: #111827; --muted: #6b7280; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; color: var(--ink); background: #fff; }
  header { padding: 4rem 1.5rem 3rem; text-align: center; background: linear-gradient(135deg, var(--accent), #111827); color: #fff; }
  header h1 { margin: 0 0 0.75rem; font-size: clamp(1.75rem, 5vw, 2.75rem); }
  header p { max-width: 640px; margin: 0 auto; font-size: 1.1rem; opacity: 0.92; }
  .cta { display: inline-block; margin-top: 1.75rem; padding: 0.95rem 1.8rem; background: #fff; color: var(--accent); border-radius: 999px; text-decoration: none; font-weight: 700; }
  main { max-width: 1040px; margin: 0 auto; padding: 0 1.5rem; }
  section { margin: 3.5rem 0; }
  h2 { text-align: center; font-size: 1.75rem; margin-bottom: 0.5rem; }
  .subhead { text-align: center; color: var(--muted); margin-bottom: 2rem; }
  .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; }
  .feature { border: 1px solid #e5e7eb; border-radius: 12px; padding: 1.5rem; }
  .feature h3 { margin: 0 0 0.4rem; font-size: 1.05rem; }
  .feature p { margin: 0; color: var(--muted); font-size: 0.92rem; }
  .verticals { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center; }
  .chip { background: #f3f4f6; border-radius: 999px; padding: 0.5rem 1rem; font-size: 0.9rem; color: var(--ink); }
  .pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
  .plan { border: 2px solid #e5e7eb; border-radius: 16px; padding: 2rem; }
  .plan.growth { border-color: var(--accent); position: relative; }
  .plan .badge { position: absolute; top: -0.8rem; right: 1.5rem; background: var(--accent); color: #fff; padding: 0.3rem 0.8rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
  .plan h3 { margin: 0 0 0.25rem; font-size: 1.1rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .plan .price { font-size: 2.25rem; font-weight: 800; margin: 0.25rem 0 1.25rem; }
  .plan .price span { font-size: 1rem; font-weight: 500; color: var(--muted); }
  .plan ul { list-style: none; padding: 0; margin: 0 0 1.5rem; }
  .plan li { padding: 0.4rem 0; color: #374151; font-size: 0.94rem; }
  .plan li::before { content: "✓ "; color: var(--accent); font-weight: 700; }
  .plan button { width: 100%; padding: 0.9rem; border-radius: 10px; border: none; background: var(--accent); color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; }
  .plan.starter button { background: var(--ink); }
  #signup { background: #f9fafb; border-radius: 20px; padding: 2.5rem; }
  #signup form { max-width: 480px; margin: 0 auto; display: grid; gap: 0.9rem; }
  #signup label { font-size: 0.85rem; font-weight: 600; color: #374151; display: block; margin-bottom: 0.3rem; }
  #signup input, #signup select { width: 100%; padding: 0.7rem 0.9rem; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.95rem; }
  #signup button[type="submit"] { padding: 0.95rem; border-radius: 10px; border: none; background: var(--accent); color: #fff; font-weight: 700; font-size: 1rem; cursor: pointer; margin-top: 0.5rem; }
  #signup-result { max-width: 480px; margin: 1rem auto 0; text-align: center; font-size: 0.95rem; }
  #signup-result.error { color: #b91c1c; }
  #signup-result.success { color: #15803d; }
  footer { text-align: center; padding: 3rem 1.5rem; color: var(--muted); font-size: 0.85rem; }
</style>
</head>
<body>
<header>
  <h1>The Operating System for Service Companies</h1>
  <p>Booking, billing, a website, and a WhatsApp bot — all in one place, built for cleaning, salons, repair, tutoring, pet care, fitness, and spa &amp; laundry businesses.</p>
  <a class="cta" href="#signup">Get Started</a>
</header>

<main>
  <section id="features">
    <h2>Everything your business needs</h2>
    <p class="subhead">No separate booking app, invoicing tool, website builder, or WhatsApp number to juggle.</p>
    <div class="features">
      <div class="feature"><h3>Booking calendar</h3><p>Multi-staff or solo, recurring jobs, reminders, and no double-bookings.</p></div>
      <div class="feature"><h3>WhatsApp bot</h3><p>Customers book straight from WhatsApp — enquiry, quote, and confirmation, automatically.</p></div>
      <div class="feature"><h3>Invoicing &amp; VAT</h3><p>Quote to invoice, UAE VAT handled, payment links, and auto-reminders for overdue bills.</p></div>
      <div class="feature"><h3>Your own website</h3><p>A booking-ready site on your own subdomain — or your own domain on Growth.</p></div>
    </div>
  </section>

  <section id="verticals">
    <h2>Built for your kind of business</h2>
    <div class="verticals">
      ${VERTICAL_OPTIONS.filter((v) => v.value !== "generic")
        .map((v) => `<span class="chip">${v.label}</span>`)
        .join("")}
    </div>
  </section>

  <section id="pricing">
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

  <section id="signup">
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
</main>

<footer>Powered by ServBazaar</footer>

<script>
  var API_BASE = ${JSON.stringify(apiBaseUrl)};

  function selectPlan(plan) {
    document.getElementById('plan').value = plan;
    document.getElementById('signup').scrollIntoView({ behavior: 'smooth' });
  }

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
        resultEl.textContent = "You're all set! Your site is live at " + result.data.tenant.subdomain + ". Check your email/WhatsApp for login details.";
        form.reset();
        submitBtn.textContent = 'Account created';
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
