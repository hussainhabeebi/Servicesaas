/** Plain browser JS kept separate so rendered pages can be tested without a bundler. */
export const PORTAL_SCRIPT = String.raw`
(function () {
'use strict';
var config = PORTAL_CONFIG, staff = config.role === 'staff';
var root = staff ? '/staff-portal' : '/customer';
var storageKey = 'sb_portal_' + config.role;
var token = sessionStorage.getItem(storageKey), state = {}, calendarOffset = 0;
var invite = new URLSearchParams(location.hash.slice(1)).get('invite');
if (invite) { history.replaceState(null, '', location.pathname); document.getElementById('login-form').hidden = true; document.getElementById('activate-form').hidden = false; }
function el(id) { return document.getElementById(id); }
function node(tag, text, cls) { var n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
function empty(id, text) { el(id).replaceChildren(node('p', text || 'Nothing here yet.', 'list-empty')); }
function message(text, error, auth) { var n = el(auth ? 'auth-message' : 'message'); n.textContent = text; n.className = error ? 'notice error' : 'notice'; }
function money(n, currency) { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || state.currency || 'AED' }).format(n); }
function when(iso) { return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); }
function option(select, value, text) { var o = node('option', text); o.value = value; select.appendChild(o); }
function badge(status) { return node('span', status.replace(/_/g, ' '), 'badge ' + status); }
function action(text, fn, secondary) { var b = node('button', text, secondary ? 'secondary' : ''); b.type = 'button'; b.addEventListener('click', function () { run(fn, b); }); return b; }
function details(label) { var d = node('details'); d.appendChild(node('summary', label)); return d; }
function field(form, label, name, type, value) { var l = node('label', label); var input = document.createElement(type === 'textarea' ? 'textarea' : 'input'); input.name = name; if (type !== 'textarea') input.type = type || 'text'; input.value = value || ''; input.required = true; l.appendChild(input); form.appendChild(l); return input; }
function localValue(iso) { var date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function card(title, status) { var c = node('article', undefined, 'card'), r = node('div', undefined, 'row'); r.appendChild(node('h3', title)); if (status) r.appendChild(badge(status)); c.appendChild(r); return c; }
function clearSession() { token = null; sessionStorage.removeItem(storageKey); el('dashboard').hidden = true; el('auth').hidden = false; el('logout').hidden = true; state = {}; }
async function request(path, method, body, blob) {
  var res = await fetch(config.api + path, { method: method || 'GET', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Site-Host': location.host, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (res.status === 401 && token) { clearSession(); throw new Error('Your session ended. Please sign in again.'); }
  if (blob && res.ok) return res.blob();
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) { var msg = typeof data.error === 'string' ? data.error : 'Could not complete that action.'; if (data.bookings && data.bookings.length) msg += ' ' + data.bookings.length + ' visit(s) were booked before the conflict. Check your history before trying again.'; throw new Error(msg); }
  return data;
}
async function run(fn, button) { if (button) button.disabled = true; try { await fn(); } catch (e) { message(e.message, true, el('dashboard').hidden); } finally { if (button) button.disabled = false; } }
function panel(key) { document.querySelectorAll('[data-panel]').forEach(function (s) { s.hidden = s.dataset.panel !== key; }); el('portal-nav').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-current', String(b.dataset.key === key)); }); }
function nav() { el('portal-nav').replaceChildren(); var items = staff ? [['overview','Overview'],['jobs','My jobs & calendar'],['tasks','Tasks & reminders'],['availability','Working hours & areas'],['support','Contact business']] : [['overview','Overview'],['book','Book a service'],['bookings','Bookings & history'],['invoices','Invoices & payments'],['referrals','Referrals & loyalty'],['profile','Profile & addresses'],['support','Help & enquiries']]; items.forEach(function (item) { var b = action(item[1], function () { panel(item[0]); }, true); b.dataset.key = item[0]; el('portal-nav').appendChild(b); }); panel('overview'); }
function renderStats(items) { el('stats').replaceChildren(); items.forEach(function (item) { var c = node('div', undefined, 'card'); c.append(node('p', item[0], 'muted small'), node('div', String(item[1]), 'stat-number')); el('stats').appendChild(c); }); }
function renderSupport() { var target = el('support-actions'); target.replaceChildren(); if (config.phone) { var digits = config.phone.replace(/\D/g, ''); var wa = node('a', 'WhatsApp us', 'button'); wa.href = 'https://wa.me/' + digits; wa.target = '_blank'; wa.rel = 'noopener'; var call = node('a', 'Call us', 'button secondary'); call.href = 'tel:+' + digits; target.append(wa, call); } else target.appendChild(node('p', 'Contact details will appear when the business adds them.', 'muted')); }
function serviceFor(id) { return (state.services || []).find(function (s) { return s.id === id; }); }
function bookingCard(b, compact) {
  var service = serviceFor(b.service_id), c = card(service ? service.name : 'Service visit', b.status);
  c.appendChild(node('p', when(b.scheduled_start), 'muted'));
  if (b.recurrence_rule) c.appendChild(node('p', 'Repeat: ' + b.recurrence_rule, 'small'));
  if (b.cancellation_fee) c.appendChild(node('p', 'Cancellation fee: ' + money(b.cancellation_fee), 'small'));
  if (compact) return c;
  var actions = node('div', undefined, 'actions');
  actions.appendChild(action('Book again', function () { panel('book'); el('service').value = b.service_id; serviceChanged(); } , true));
  c.appendChild(actions);
  if (['scheduled','en_route'].includes(b.status)) {
    var reschedule = details('Reschedule visit'), form = node('form'); field(form, 'New date and time (your device local time)', 'start', 'datetime-local', localValue(b.scheduled_start));
    var save = node('button', 'Save new time'); form.appendChild(save);
    form.addEventListener('submit', function (e) { e.preventDefault(); run(async function () { var start = new Date(form.elements.start.value), duration = Date.parse(b.scheduled_end) - Date.parse(b.scheduled_start); await request(root + '/bookings/' + encodeURIComponent(b.id) + '/reschedule', 'PATCH', { scheduled_start: start.toISOString(), scheduled_end: new Date(start.getTime() + duration).toISOString() }); message('Visit rescheduled.'); await load(); }, save); }); reschedule.appendChild(form); c.appendChild(reschedule);
    var cancel = details('Cancel visit'), cf = node('form');
    cf.appendChild(node('p', 'The existing policy charges 25% of the service price for cancellations within 24 hours of the visit.', 'small muted'));
    field(cf, 'Reason', 'reason', 'textarea'); var cb = node('button', 'Cancel this visit', 'secondary'); cf.appendChild(cb);
    cf.addEventListener('submit', function (e) { e.preventDefault(); run(async function () { var result = await request(root + '/bookings/' + encodeURIComponent(b.id) + '/cancel', 'POST', { reason: cf.elements.reason.value }); message('Visit cancelled. Cancellation fee: ' + money(result.cancellationFee)); await load(); }, cb); }); cancel.appendChild(cf); c.appendChild(cancel);
  }
  if (b.status === 'completed') {
    var review = details('Review this visit'), rf = node('form'), label = node('label', 'Rating'), rating = node('select'); rating.name = 'rating'; [5,4,3,2,1].forEach(function (v) { option(rating, String(v), v + ' stars'); }); label.appendChild(rating); rf.appendChild(label);
    var existing = (state.reviews || []).find(function (r) { return r.booking_id === b.id; }); if (existing && existing.rating) rating.value = existing.rating;
    var comment = field(rf, 'Your review', 'comment', 'textarea', existing && existing.comment); comment.required = false; comment.maxLength = 2000;
    var rb = node('button', existing ? 'Update review' : 'Submit review'); rf.appendChild(rb);
    rf.addEventListener('submit', function (e) { e.preventDefault(); run(async function () { await request(root + '/reviews', 'POST', { booking_id: b.id, rating: Number(rating.value), comment: comment.value }); message('Thank you. Your review has been saved.'); await load(); }, rb); }); review.appendChild(rf); c.appendChild(review);
  }
  return c;
}
function renderCustomer() {
  state.currency = state.me.business && state.me.business.currency || 'AED';
  var customer = state.me.customer;
  el('greeting').textContent = 'Hello, ' + customer.name + '.'; el('identity').textContent = 'Customer';
  var upcoming = state.bookings.filter(function (b) { return !['cancelled','completed'].includes(b.status); }).sort(function (a,b) { return a.scheduled_start.localeCompare(b.scheduled_start); });
  var balance = state.invoices.reduce(function (n, i) { return n + (['sent','partial','overdue'].includes(i.status) ? Math.max(0, i.total - i.amount_paid) : 0); }, 0);
  renderStats([['Upcoming visits', upcoming.length], ['Completed visits', customer.completed_bookings_count], ['Outstanding balance', money(balance)]]);
  el('next-visits').replaceChildren(); upcoming.slice(0,3).forEach(function (b) { el('next-visits').appendChild(bookingCard(b, true)); }); if (!upcoming.length) empty('next-visits', 'No upcoming visits. Book a service when you are ready.');
  el('bookings-list').replaceChildren(); state.bookings.slice().sort(function (a,b) { return b.scheduled_start.localeCompare(a.scheduled_start); }).forEach(function (b) { el('bookings-list').appendChild(bookingCard(b)); }); if (!state.bookings.length) empty('bookings-list', 'Your visits will appear here after booking.');
  var selectedService = el('service').value; el('service').replaceChildren(); state.services.forEach(function (s) { option(el('service'), s.id, s.name + ' · ' + money(s.price)); }); if (selectedService) el('service').value = selectedService;
  if (!el('service').value && state.services.length) el('service').value = state.services[0].id;
  el('book-address').replaceChildren(); state.addresses.forEach(function (a) { option(el('book-address'), a.id, a.label + ': ' + a.address_line); });
  el('profile-name').value = customer.name; el('profile-email').value = customer.email || ''; el('profile-preferences').value = customer.preferences && customer.preferences.notes || '';
  el('loyalty').textContent = customer.completed_bookings_count + ' completed visits. Any available rewards are managed by the business.';
  el('addresses-list').replaceChildren(); state.addresses.forEach(function (a) { var c = card(a.label); c.appendChild(node('p', [a.address_line, a.area, a.city].filter(Boolean).join(', '), 'muted')); el('addresses-list').appendChild(c); });
  el('referrals-list').replaceChildren(); state.referrals.forEach(function (r) { var c = card(r.referred_name || 'Referral', r.reward_status); if (r.reward_description) c.appendChild(node('p', r.reward_description)); el('referrals-list').appendChild(c); }); if (!state.referrals.length) empty('referrals-list', 'Your referral reward status will appear here.');
  renderInvoices(); serviceChanged();
}
function renderInvoices() {
  el('invoices-list').replaceChildren();
  state.invoices.forEach(function (i) { var c = card(i.invoice_number + (i.kind === 'deposit' ? ' · Deposit' : ''), i.status); c.appendChild(node('p', money(i.total, i.currency) + ' · Paid ' + money(i.amount_paid, i.currency), 'muted')); c.appendChild(node('p', 'VAT: ' + money(i.vat_amount, i.currency) + (i.due_date ? ' · Due ' + i.due_date : ''), 'small'));
    var actions = node('div', undefined, 'actions');
    actions.appendChild(action('Download PDF', async function () { var pdf = await request(root + '/invoices/' + encodeURIComponent(i.id) + '/pdf', 'GET', undefined, true); var url = URL.createObjectURL(pdf); var a = node('a'); a.href = url; a.download = 'invoice.pdf'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000); }, true));
    if (['sent','partial','overdue'].includes(i.status) && i.total > i.amount_paid) {
      if (state.gateways.length) { var select = node('select'); select.setAttribute('aria-label', 'Payment gateway'); state.gateways.forEach(function (g) { option(select, g, g.replace(/_/g, ' ')); }); actions.appendChild(select); actions.appendChild(action('Pay ' + money(i.total - i.amount_paid, i.currency), async function () { var r = await request(root + '/payments/link', 'POST', { invoice_id: i.id, gateway: select.value }); var url = new URL(r.paymentUrl); if (url.protocol !== 'https:') throw new Error('Invalid payment link. Contact the business.'); location.assign(url.href); })); }
      else c.appendChild(node('p', 'Online payments are not configured. Contact the business to arrange payment.', 'small muted'));
    }
    c.appendChild(actions); el('invoices-list').appendChild(c);
  });
  if (!state.invoices.length) empty('invoices-list', 'Published invoices and deposits will appear here.');
}
function jobCard(j, compact) {
  var b = j.booking, c = card(j.service && j.service.name || 'Service visit', b.status);
  c.appendChild(node('p', when(b.scheduled_start) + ' – ' + new Date(b.scheduled_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'muted'));
  if (j.customer) c.appendChild(node('p', j.customer.name));
  if (j.address) c.appendChild(node('p', [j.address.address_line, j.address.area, j.address.city].filter(Boolean).join(', '), 'small muted'));
  if (compact) return c;
  if (b.notes) c.appendChild(node('p', b.notes, 'small'));
  var actions = node('div', undefined, 'actions');
  if (j.customer && j.customer.phone) { var phone = j.customer.phone.replace(/\D/g, ''), call = node('a', 'Call customer', 'button secondary'), wa = node('a', 'WhatsApp', 'button secondary'); call.href = 'tel:+' + phone; wa.href = 'https://wa.me/' + phone; wa.target = '_blank'; wa.rel = 'noopener'; actions.append(call, wa); }
  if (['scheduled','en_route'].includes(b.status)) {
    if (b.status === 'scheduled') actions.appendChild(action('En route', async function () { await request(root + '/bookings/' + encodeURIComponent(b.id) + '/status', 'POST', { status: 'en_route' }); message('Job marked en route.'); await load(); }));
    actions.appendChild(action('Check in', async function () { await jobAction(b, 'checkin', false); }));
    actions.appendChild(action('Check in with GPS', async function () { await jobAction(b, 'checkin', true); }, true));
  }
  if (b.status === 'in_progress') { actions.appendChild(action('Complete job', async function () { await jobAction(b, 'checkout', false); })); actions.appendChild(action('Complete with GPS', async function () { await jobAction(b, 'checkout', true); }, true)); }
  c.appendChild(actions); return c;
}
async function jobAction(booking, type, gps) {
  var coordinates = {};
  if (gps) { if (!navigator.geolocation) throw new Error('GPS is unavailable. Use the manual action.'); coordinates = await new Promise(function (resolve, reject) { navigator.geolocation.getCurrentPosition(function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); }, function () { reject(new Error('Location permission denied or GPS unavailable. Use the manual action.')); }, { timeout: 10000 }); }); }
  var r = await request(root + '/bookings/' + encodeURIComponent(booking.id) + '/' + type, 'POST', coordinates);
  message(type === 'checkout' ? (r.invoiceId ? 'Job completed. Billing has a draft invoice ready for the owner.' : 'Job completed.') : 'Checked in. Job is in progress.'); await load();
}
function renderStaff() {
  var me = state.me.staff, jobs = state.jobs;
  el('greeting').textContent = 'Hello, ' + me.name + '.'; el('identity').textContent = 'Staff';
  var pending = jobs.filter(function (j) { return !['cancelled','completed'].includes(j.booking.status); }).sort(function (a,b) { return a.booking.scheduled_start.localeCompare(b.booking.scheduled_start); });
  renderStats([['Assigned visits', state.performance.assigned],['Completed visits', state.performance.completed],['Pending tasks', state.tasks.filter(function (t) { return t.status === 'pending'; }).length]]);
  el('next-visits').replaceChildren(); pending.slice(0,3).forEach(function (j) { el('next-visits').appendChild(jobCard(j, true)); }); if (!pending.length) empty('next-visits', 'No upcoming jobs assigned.');
  renderCalendar(); renderJobList();
  el('tasks-list').replaceChildren(); state.tasks.forEach(function (t) { var c = card(t.title, t.status); if (t.description) c.appendChild(node('p', t.description, 'muted')); if (t.due_at) c.appendChild(node('p', 'Due ' + when(t.due_at), 'small')); if (t.status !== 'done') c.appendChild(action('Mark done', async function () { await request(root + '/tasks/' + encodeURIComponent(t.id) + '/done', 'PATCH'); message('Task completed.'); await load(); })); el('tasks-list').appendChild(c); }); if (!state.tasks.length) empty('tasks-list', 'No tasks assigned.');
  el('availability-list').replaceChildren(); var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; state.me.availability.forEach(function (a) { var c = card(days[a.day_of_week]); c.appendChild(node('p', a.start_time + ' – ' + a.end_time)); c.appendChild(action('Remove hours', async function () { await request(root + '/availability/' + encodeURIComponent(a.id), 'DELETE'); await load(); }, true)); el('availability-list').appendChild(c); }); if (!state.me.availability.length) empty('availability-list', 'No working hours saved. Add your weekly availability below.');
  el('areas').value = (me.service_areas || []).join('\n');
  el('concierge-form').hidden = true;
}

function renderJobList(day) {
  el('jobs-list').replaceChildren();
  var jobs = state.jobs.filter(function (j) { return !day || localValue(j.booking.scheduled_start).slice(0,10) === day; }).sort(function (a,b) { return a.booking.scheduled_start.localeCompare(b.booking.scheduled_start); });
  jobs.forEach(function (j) { el('jobs-list').appendChild(jobCard(j)); });
  if (!jobs.length) empty('jobs-list', day ? 'No jobs assigned for this day.' : 'Your assigned jobs will appear here.');
}
function renderCalendar() {
  var start = new Date(); start.setHours(12,0,0,0); start.setDate(start.getDate() - start.getDay() + calendarOffset * 7);
  var finish = new Date(start); finish.setDate(finish.getDate()+6);
  el('calendar-range').textContent = start.toLocaleDateString() + ' – ' + finish.toLocaleDateString();
  el('job-calendar').replaceChildren();
  for (var i=0;i<7;i++) { var date = new Date(start); date.setDate(date.getDate()+i); var day = localValue(date.toISOString()).slice(0,10); var count = state.jobs.filter(function (j) { return localValue(j.booking.scheduled_start).slice(0,10) === day && j.booking.status !== 'cancelled'; }).length;
    var b = action(date.toLocaleDateString([], { weekday:'short', day:'numeric' }) + ' · ' + count + ' jobs', (function (selectedDay) { return function () { renderJobList(selectedDay); el('job-calendar').querySelectorAll('button').forEach(function (button) { button.setAttribute('aria-pressed',String(button.dataset.day === selectedDay)); }); }; })(day), true); b.className = 'schedule-day'; b.dataset.day = day; b.setAttribute('aria-pressed','false'); el('job-calendar').appendChild(b);
  }
}

async function load() {
  el('loading').hidden = false;
  try {
    if (staff) { var data = await Promise.all([request(root + '/me'), request(root + '/jobs'), request(root + '/tasks')]); state = { me: data[0], jobs: data[1].jobs, performance: data[1].performance, tasks: data[2].tasks }; renderStaff(); }
    else { var data = await Promise.all([request(root + '/me'), request(root + '/bookings'), request('/public/services'), request(root + '/addresses'), request(root + '/invoices'), request(root + '/referrals'), request(root + '/reviews')]); state = { me: data[0], bookings: data[1].bookings, services: data[2].services, addresses: data[3].addresses, invoices: data[4].invoices, gateways: data[4].gateways, referrals: data[5].referrals, reviews: data[6].reviews }; renderCustomer(); }
    el('auth').hidden = true; el('dashboard').hidden = false; el('logout').hidden = false; renderSupport();
  } finally { el('loading').hidden = true; }
}
async function serviceChanged() {
  var s = serviceFor(el('service').value); if (!s) { el('service-detail').textContent = 'No active services available.'; return; }
  el('service-detail').textContent = money(s.price) + ' · ' + s.duration_minutes + ' minutes' + (s.deposit_type && s.deposit_type !== 'none' ? ' · A booking deposit applies.' : '');
  var current = el('recurrence').value; el('recurrence').replaceChildren(); option(el('recurrence'), '', 'One visit'); (s.recurrence_options || []).forEach(function (r) { option(el('recurrence'), r, r); }); if (current && (s.recurrence_options || []).includes(current)) el('recurrence').value = current;
  el('visit-count').disabled = !el('recurrence').value;
  el('suggestions').replaceChildren();
  request('/public/quote?service_id=' + encodeURIComponent(s.id)).then(function (q) { if (el('service').value === s.id) el('service-detail').textContent = 'Estimated service price: ' + money(q.estimate,q.currency) + ' · ' + q.durationMinutes + ' minutes. VAT and any booking deposit are shown on your invoice.'; }).catch(function () {});
  updateSlots();
  try { var addons = await request('/public/suggestions/addons?service_id=' + encodeURIComponent(s.id)); if (el('service').value !== s.id) return; (addons.suggestions || []).forEach(function (a) { var c = card(a.name); c.appendChild(node('p', 'You may also like this service.', 'muted small')); c.appendChild(action('Choose this service', function () { el('service').value = a.id; serviceChanged(); }, true)); el('suggestions').appendChild(c); }); } catch (_) {}
}

async function updateSlots() {
  el('suggested-slots').replaceChildren(); el('slot-message').textContent = '';
  var serviceId = el('service').value, date = el('book-date').value.slice(0,10);
  if (!serviceId || !date) return;
  var address = state.addresses && state.addresses.find(function (a) { return a.id === el('book-address').value; });
  try { var data = await request('/public/suggestions/best-slots?service_id=' + encodeURIComponent(serviceId) + '&date=' + encodeURIComponent(date) + (address && address.area ? '&area=' + encodeURIComponent(address.area) : ''));
    if (serviceId !== el('service').value || date !== el('book-date').value.slice(0,10)) return;
    el('slot-message').textContent = data.slots && data.slots.length ? 'Suggested times (shown in your device local time; confirmed when you book):' : 'No suggested times available. Contact the business if you need help with your date.';
    (data.slots || []).filter(function (s) { return s.recommended; }).concat((data.slots || []).filter(function (s) { return !s.recommended; })).slice(0,5).forEach(function (s) { var b = action(when(s.start) + (s.recommended ? ' · Suggested' : ''), function () { el('book-date').value = localValue(s.start); }, true); el('suggested-slots').appendChild(b); });
  } catch (_) { el('slot-message').textContent = 'Suggested times are temporarily unavailable. You can still choose a date and book.'; }
}

function onForm(id, fn) { el(id).addEventListener('submit', function (e) { e.preventDefault(); var form = e.currentTarget, button = form.querySelector('button'); run(function () { return fn(form, Object.fromEntries(new FormData(form))); }, button); }); }
onForm('login-form', async function (f, b) { var data = await request(staff ? '/public/staff-auth/login' : '/customer/auth/login', 'POST', staff ? b : { phone: b.identifier, password: b.password }); token = data.accessToken; sessionStorage.setItem(storageKey, token); f.reset(); nav(); await load(); message(''); });
onForm('activate-form', async function (f,b) { await request('/customer/auth/activate', 'POST', { token: invite, password: b.password }); invite = null; f.reset(); f.hidden = true; el('login-form').hidden = false; message('Account activated. Sign in with your registered phone and new password.', false, true); });
onForm('book-form', async function (f,b) { var s = serviceFor(b.service_id); if (!s) throw new Error('Choose a service.'); var start = new Date(b.scheduled_start); var body = { customer_id: state.me.customer.id, service_id: b.service_id, address_id: b.address_id, scheduled_start: start.toISOString(), scheduled_end: new Date(start.getTime() + s.duration_minutes * 60000).toISOString(), notes: b.notes, recurrence_count: b.recurrence_rule ? Number(b.recurrence_count) : 1, ...(b.recurrence_rule ? { recurrence_rule: b.recurrence_rule } : {}) }; try { var r = await request(root + '/bookings', 'POST', body); message(r.bookings.length + ' visit(s) confirmed. Any deposit invoice appears in Invoices & payments.'); f.reset(); await load(); panel('bookings'); } catch(e) { await load(); throw e; } });
onForm('profile-form', async function (f,b) { await request(root + '/me', 'PATCH', { name: b.name, email: b.email || null, preferences: { notes: b.preferences } }); message('Profile saved.'); await load(); });
onForm('address-form', async function (f,b) { await request(root + '/addresses', 'POST', b); f.reset(); message('Address saved.'); await load(); });
onForm('referral-form', async function (f,b) { await request(root + '/referrals', 'POST', b); f.reset(); message('Referral saved.'); await load(); });
onForm('staff-password-form', async function (f,b) { await request(root + '/password', 'POST', b); f.reset(); clearSession(); message('Password updated. Please sign in again.', false, true); });
onForm('password-form', async function (f,b) { await request(root + '/password', 'POST', b); f.reset(); clearSession(); message('Password updated. Please sign in again.', false, true); });
onForm('availability-form', async function (f,b) { await request(root + '/availability', 'POST', { day_of_week: Number(b.day_of_week), start_time: b.start_time, end_time: b.end_time }); message('Working hours added.'); await load(); });
onForm('areas-form', async function (f,b) { await request(root + '/me', 'PATCH', { service_areas: b.areas.split('\n').map(function (v) { return v.trim(); }).filter(Boolean) }); message('Service areas saved.'); await load(); });
onForm('concierge-form', async function (f,b) { var r = await request('/public/concierge', 'POST', { message: b.message, history: [] }); el('concierge-reply').textContent = r.reply; });
el('week-prev').addEventListener('click',function () { calendarOffset--; renderCalendar(); });
el('week-next').addEventListener('click',function () { calendarOffset++; renderCalendar(); });
el('show-all-jobs').addEventListener('click',function () { renderJobList(); renderCalendar(); });
el('service').addEventListener('change', serviceChanged);
el('book-date').addEventListener('change', updateSlots);
el('book-address').addEventListener('change', updateSlots);
el('recurrence').addEventListener('change', function () { el('visit-count').disabled = !el('recurrence').value; });
el('logout').addEventListener('click', function () { run(async function () { await request(root + '/logout', 'POST'); clearSession(); message('Signed out.', false, true); }); });
el('enable-push').addEventListener('click', function () { run(async function () { if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser does not support push reminders.'); var vapid = await request('/public/push/vapid-public-key'); if (!vapid.publicKey) throw new Error('Reminders are not configured yet. Contact the business.'); var reg = await navigator.serviceWorker.ready, key = vapid.publicKey.replace(/-/g, '+').replace(/_/g, '/'); var bytes = Uint8Array.from(atob(key.padEnd(Math.ceil(key.length / 4) * 4, '=')), function (c) { return c.charCodeAt(0); }); var sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }); var json = sub.toJSON(); await request(root + '/push/subscribe', 'POST', { endpoint: json.endpoint, keys: json.keys }); message('Visit reminders enabled.'); }); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
nav();
if (token && !invite) run(load);
})();
`;
