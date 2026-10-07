import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import app, { BookingCalendarDO } from "../packages/app/src/index";
import site from "../packages/site-engine/src/index";
import { hashPassword, signAccessToken, signCustomerAccessToken, verifyAccessToken, verifyCustomerAccessToken } from "../packages/platform/src/index";
import { renderPortal } from "../packages/site-engine/src/templates/portal";
import { SERVICE_WORKER_JS } from "../packages/site-engine/src/pwa";
import { renderSitemap } from "../packages/site-engine/src/seo";
import { businessLocalTime } from "../packages/app/src/lib/suggestions";

class LocalD1 {
  sqlite = new DatabaseSync(":memory:");
  constructor() {
    for (const file of readdirSync("packages/app/migrations").filter(f => f.endsWith('.sql')).sort()) this.sqlite.exec(readFileSync(`packages/app/migrations/${file}`, 'utf8'));
  }
  prepare(query: string) {
    const db = this.sqlite;
    const statement = (values: any[] = []) => ({
      bind: (...args: any[]) => statement(args),
      async all() { return { success: true, results: db.prepare(query).all(...values), meta: {} }; },
      async raw() { const s = db.prepare(query); s.setReturnArrays(true); return s.all(...values); },
      async run() { const result = db.prepare(query).run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
      async first() { return db.prepare(query).get(...values) ?? null; },
    });
    return statement();
  }
  async batch(statements: any[]) { return Promise.all(statements.map(s => s.all())); }
}
const db = new LocalD1();
const password = "long-secure-password";
const passwordHash = await hashPassword(password);
const calendars = new Map<string, BookingCalendarDO>();
const env: any = { DB: db, JWT_SECRET: 'test-secret-do-not-use', ROOT_DOMAIN: 'test.example', API_BASE_URL: 'https://api.test.example', ENVIRONMENT: 'staging', FILES: { put: async () => {} }, BOOKING_CALENDAR: {
  idFromName: (name: string) => name,
  get: (id: string) => {
    if (!calendars.has(id)) { const data = new Map(); calendars.set(id, new BookingCalendarDO({ storage: { get: async (k: string) => data.get(k), put: async (k: string, v: unknown) => { data.set(k, v); } } } as any)); }
    return { fetch: (url: string, init: any) => calendars.get(id)!.fetch(new Request(url, init)) };
  }
} };
const sql = db.sqlite;
for (const t of ['a','b']) sql.prepare("INSERT INTO tenants(id,slug,business_name,vertical,subdomain) VALUES(?,?,?,?,?)").run(t,t,'Business '+t,'cleaning',t+'.test.example');
for (const [id, tenant] of [['c1','a'],['c2','a'],['c3','b']]) sql.prepare("INSERT INTO customers(id,tenant_id,name,phone) VALUES(?,?,?,?)").run(id,tenant,id,'+9715000000'+id.slice(1));
for (const [id, tenant] of [['s1','a'],['s2','a'],['s3','b']]) sql.prepare("INSERT INTO staff(id,tenant_id,name) VALUES(?,?,?)").run(id,tenant,id);
for (const [id,role,staffId] of [['owner','owner',null],['staff1','staff','s1'],['staff2','staff','s2']]) sql.prepare("INSERT INTO tenant_users(id,tenant_id,name,email,password_hash,role,staff_id) VALUES(?,?,?,?,?,?,?)").run(id,'a',id,id+'@test.example',passwordHash,role,staffId);
for (const [id, tenant] of [['v1','a'],['v2','b']]) sql.prepare("INSERT INTO services(id,tenant_id,name,price,duration_minutes,recurrence_options) VALUES(?,?,?,?,?,?)").run(id,tenant,'Hourly cleaning',25,60,'["weekly"]');
for (const [id, customer] of [['a1','c1'],['a2','c2']]) sql.prepare("INSERT INTO customer_addresses(id,tenant_id,customer_id,address_line) VALUES(?,?,?,?)").run(id,'a',customer,'Sharjah');
const future = new Date(Date.now() + 7 * 86400000).toISOString();
const later = new Date(Date.parse(future) + 3600000).toISOString();
for (const [id,customer,staffId] of [['j1','c1','s1'],['j2','c2','s2']]) sql.prepare("INSERT INTO bookings(id,tenant_id,customer_id,staff_id,service_id,scheduled_start,scheduled_end) VALUES(?,?,?,?,?,?,?)").run(id,'a',customer,staffId,'v1',future,later);
sql.prepare("INSERT INTO tasks(id,tenant_id,assigned_staff_id,title) VALUES(?,?,?,?)").run('task1','a','s1','Reminder');
sql.prepare("INSERT INTO tasks(id,tenant_id,assigned_staff_id,title) VALUES(?,?,?,?)").run('task2','a','s2','Private task');
const owner = await signAccessToken({ sub:'owner',tenant_id:'a',role:'owner' }, env.JWT_SECRET);
const staff1 = await signAccessToken({ sub:'staff1',tenant_id:'a',role:'staff',staff_id:'s1' }, env.JWT_SECRET);
let customerToken = '';
async function request(path: string, method = 'GET', token = '', body?: unknown, host = 'a.test.example') {
  const response = await app.fetch(new Request('https://api.test.example' + path, { method, headers: { 'Content-Type':'application/json', 'X-Site-Host':host, ...(token ? { Authorization:'Bearer '+token } : {}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) }), env, {} as any);
  return { status:response.status, body:response.headers.get('Content-Type')?.includes('application/json') ? await response.json() as any : await response.arrayBuffer(), headers:response.headers };
}

test('staff website sign-in resolves the business and rejects owner accounts or another website', async () => {
  const login = await request('/public/staff-auth/login', 'POST', '', { identifier:'staff1@test.example', password });
  assert.equal(login.status, 200); assert.equal(login.body.user.role, 'staff');
  assert.equal((await request('/public/staff-auth/login', 'POST', '', { identifier:'staff1@test.example', password }, 'b.test.example')).status, 401);
  assert.equal((await request('/public/staff-auth/login', 'POST', '', { identifier:'owner@test.example', password })).status, 403);
});

test('owner invitation is tenant scoped; activation is one use and enables customer login', async () => {
  assert.equal((await request('/api/customers/c3/portal-invite','POST',owner)).status,404);
  const invitation = await request('/api/customers/c1/portal-invite','POST',owner);
  assert.equal(invitation.status,200);
  const invite = new URL(invitation.body.activationUrl).hash.slice(8);
  assert.equal((await request('/customer/auth/activate','POST','',{ token:invite,password },'b.test.example')).status,400);
  assert.equal((await request('/customer/auth/activate','POST','',{ token:invite,password })).status,200);
  assert.equal((await request('/customer/auth/activate','POST','',{ token:invite,password })).status,400);
  const login = await request('/customer/auth/login','POST','',{ phone:'+97150000001',password });
  assert.equal(login.status,200); customerToken = login.body.accessToken;
});
test('customer tokens cannot reach business, staff or admin APIs; malformed JWTs are rejected', async () => {
  assert.equal(await verifyAccessToken(customerToken,env.JWT_SECRET),null);
  assert.equal(await verifyCustomerAccessToken(owner,env.JWT_SECRET),null);
  for (const path of ['/api/invoices','/staff-portal/jobs','/admin/tenants']) assert.equal((await request(path,'GET',customerToken)).status,401);
  assert.equal((await request('/customer/me','GET',customerToken,undefined,'b.test.example')).status,401);
  for (const value of ['broken','a.b.c','..',staff1.slice(0,-3)]) assert.equal(await verifyAccessToken(value,env.JWT_SECRET),null);
});
test('customer sees only own history and cannot change another customer job or internal job actions', async () => {
  const list = await request('/customer/bookings','GET',customerToken);
  assert.equal(list.status,200); assert.deepEqual(list.body.bookings.map((b:any)=>b.id),['j1']);
  assert.equal((await request('/customer/bookings/j2/cancel','POST',customerToken,{})).status,404);
  assert.equal((await request('/customer/bookings/j2/reschedule','PATCH',customerToken,{scheduled_start:future,scheduled_end:later})).status,404);
  for (const action of ['status','checkin','checkout']) assert.equal((await request('/customer/bookings/j1/'+action,'POST',customerToken,{status:'completed'})).status,404);
  assert.equal((await request('/customer/bookings/mine','GET',customerToken)).status,404);
});
test('booking uses authenticated customer, valid tenant service/address and catalogue duration', async () => {
  const input = { customer_id:'c2',service_id:'v1',address_id:'a1',scheduled_start:new Date(Date.now()+20*86400000).toISOString(),scheduled_end:later,staff_id:'s2' };
  assert.equal((await request('/customer/bookings','POST',customerToken,{...input,service_id:'v2'})).status,404);
  assert.equal((await request('/customer/bookings','POST',customerToken,{...input,address_id:'a2'})).status,404);
  assert.equal((await request('/customer/bookings','POST',customerToken,{...input,scheduled_start:'bad date'})).status,400);
  const created = await request('/customer/bookings','POST',customerToken,input);
  assert.equal(created.status,201);
  const booking:any = sql.prepare('SELECT * FROM bookings WHERE id=?').get(created.body.bookings[0].id);
  assert.equal(booking.customer_id,'c1'); assert.notEqual(booking.staff_id,'s2'); assert.equal(Date.parse(booking.scheduled_end)-Date.parse(booking.scheduled_start),3600000);
});
test('staff is restricted to own jobs, tasks and customer contacts on both API surfaces', async () => {
  const jobs = await request('/staff-portal/jobs','GET',staff1);
  assert.equal(jobs.status,200); assert.ok(jobs.body.jobs.every((j:any)=>j.booking.staff_id==='s1'));
  assert.equal((await request('/staff-portal/jobs','GET',staff1,undefined,'b.test.example')).status,403);
  assert.equal((await request('/staff-portal/bookings/j2/checkin','POST',staff1,{})).status,403);
  const tasks = await request('/api/tasks','GET',staff1); assert.ok(tasks.body.tasks.some((t:any)=>t.id==='task1')); assert.ok(tasks.body.tasks.every((t:any)=>t.assigned_staff_id==='s1')); assert.ok(!tasks.body.tasks.some((t:any)=>t.id==='task2'));
  assert.equal((await request('/staff-portal/tasks/task2/done','PATCH',staff1)).status,404);
  const customers = await request('/api/customers','GET',staff1); assert.deepEqual(customers.body.customers.map((c:any)=>c.id),['c1']);
  assert.equal(customers.body.customers[0].notes,undefined);
  for (const path of ['/api/invoices','/api/reports','/api/bookings','/api/staff','/api/sites']) assert.equal((await request(path,'GET',staff1)).status,403);
  assert.equal((await request('/api/customers/c1/portal-invite','POST',staff1)).status,403);
});
test('staff own hours and areas feed operational records; job lifecycle creates a draft invoice once', async () => {
  assert.equal((await request('/staff-portal/availability','POST',staff1,{day_of_week:1,start_time:'25:00',end_time:'26:00'})).status,400);
  assert.equal((await request('/staff-portal/availability','POST',staff1,{day_of_week:1,start_time:'18:00',end_time:'09:00'})).status,400);
  assert.equal((await request('/staff-portal/availability','POST',staff1,{day_of_week:1,start_time:'09:00',end_time:'18:00'})).status,201);
  assert.equal((await request('/staff-portal/me','PATCH',staff1,{service_areas:['Sharjah']})).status,200);
  assert.equal((await request('/staff-portal/bookings/j1/checkout','POST',staff1,{})).status,409);
  assert.equal((await request('/staff-portal/bookings/j1/status','POST',staff1,{status:'en_route'})).status,200);
  assert.equal((await request('/staff-portal/bookings/j1/checkin','POST',staff1,{lat:25.3,lng:55.4})).status,200);
  const completed = await request('/staff-portal/bookings/j1/checkout','POST',staff1,{});
  assert.equal(completed.status,200); assert.ok(completed.body.invoiceId);
  assert.equal((await request('/staff-portal/bookings/j1/checkout','POST',staff1,{})).status,409);
  assert.equal((sql.prepare('SELECT count(*) n FROM invoices WHERE booking_id=?').get('j1') as any).n,1);
  assert.equal((sql.prepare('SELECT completed_bookings_count n FROM customers WHERE id=?').get('c1') as any).n,1);
});
test('invoices stay private, drafts are hidden, completed visits can be reviewed, referrals cannot set rewards', async () => {
  sql.prepare("INSERT INTO invoices(id,tenant_id,customer_id,invoice_number,status,total) VALUES(?,?,?,?,?,?)").run('i2','a','c2','OTHER','sent',100);
  const invoices = await request('/customer/invoices','GET',customerToken); assert.deepEqual(invoices.body.invoices,[]);
  assert.equal((await request('/customer/invoices/i2/pdf','GET',customerToken)).status,404);
  assert.equal((await request('/customer/payments/link','POST',customerToken,{invoice_id:'i2',gateway:'telr'})).status,404);
  const draft:any = sql.prepare('SELECT id FROM invoices WHERE booking_id=?').get('j1');
  sql.prepare("UPDATE invoices SET status='sent' WHERE id=?").run(draft.id);
  const pdf = await request('/customer/invoices/'+draft.id+'/pdf','GET',customerToken); assert.equal(pdf.status,200); assert.equal(pdf.headers.get('Cache-Control'),'no-store');
  assert.equal((await request('/customer/reviews','POST',customerToken,{booking_id:'j2',rating:5})).status,400);
  assert.equal((await request('/customer/reviews','POST',customerToken,{booking_id:'j1',rating:5,comment:'Great visit'})).status,200);
  assert.equal((await request('/customer/referrals','POST',customerToken,{referred_name:'Friend',referred_phone:'+971501111111',reward_status:'granted',referring_customer_id:'c2'})).status,201);
  const referral:any = sql.prepare('SELECT * FROM referrals').get(); assert.equal(referral.referring_customer_id,'c1'); assert.equal(referral.reward_status,'pending');
  assert.equal((await request('/public/suggestions/rebook?phone=+97150000002')).status, 401);
  const rebook = await request('/public/suggestions/rebook?phone=+97150000002', 'GET', customerToken);
  assert.equal(rebook.status, 200); assert.equal(rebook.body.suggestion.serviceId, 'v1');
  assert.equal((await request('/public/push/subscribe','POST','',{endpoint:'https://push.example/guest',keys:{p256dh:'key',auth:'key'},customer_phone:'+97150000002'})).status,401);
  assert.equal((await request('/public/push/subscribe','POST',customerToken,{endpoint:'https://push.example/own',keys:{p256dh:'key',auth:'key'},customer_phone:'+97150000002'})).status,201);
  assert.equal((sql.prepare('SELECT customer_id FROM push_subscriptions WHERE endpoint=?').get('https://push.example/own') as any).customer_id,'c1');
});
test('activation reset invalidates old sessions; account disabling applies immediately; customer login locks after failures', async () => {
  const invitation = await request('/api/customers/c1/portal-invite','POST',owner); const invite = new URL(invitation.body.activationUrl).hash.slice(8);
  assert.equal((await request('/customer/auth/activate','POST','',{token:invite,password})).status,200);
  assert.equal((await request('/customer/me','GET',customerToken)).status,401);
  for (let i=0;i<4;i++) assert.equal((await request('/customer/auth/login','POST','',{phone:'+97150000001',password:'wrong'})).status,401);
  assert.equal((await request('/customer/auth/login','POST','',{phone:'+97150000001',password:'wrong'})).status,429);
  assert.equal((await request('/customer/auth/login','POST','',{phone:'+97150000001',password})).status,429);
  sql.prepare('UPDATE staff SET active=0 WHERE id=?').run('s1'); assert.equal((await request('/staff-portal/jobs','GET',staff1)).status,403);
});
test('portal HTML escapes business content and private pages are absent from sitemap/cache', () => {
  const html = renderPortal({ content:{businessName:'<script>alert(1)</script>'}, businessName:'Danfe',apiBaseUrl:'https://api.test.example',role:'customer',accent:'#30338d' });
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('noindex,nofollow'));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]; assert.equal(scripts.length,1); new Function(scripts[0]![1]!);
  new Function(SERVICE_WORKER_JS); assert.ok(SERVICE_WORKER_JS.includes('no-store'));
  const sitemap = renderSitemap('a.test.example',['pricing','reviews']); assert.ok(!sitemap.includes('#')); assert.ok(!sitemap.includes('/account'));
});

test('recommended times use the business timezone and public estimates read catalogue rates', async () => {
  assert.equal(businessLocalTime('2027-01-01', 540, 'Asia/Dubai')?.toISOString(), '2027-01-01T05:00:00.000Z');
  assert.equal(businessLocalTime('2027-07-01', 540, 'Europe/London')?.toISOString(), '2027-07-01T08:00:00.000Z');
  assert.equal((await request('/public/suggestions/best-slots?service_id=v1&date=invalid')).status, 400);
  const quote = await request('/public/quote?service_id=v1');
  assert.equal(quote.status, 200); assert.equal(quote.body.estimate, 25); assert.equal(quote.body.currency, 'AED');
});

test('website serves branded account shells with private cache and indexing headers', async () => {
  sql.prepare('INSERT INTO sites(id,tenant_id,template_key,live_content) VALUES(?,?,?,?)').run('site1','a','cleaning',JSON.stringify({ businessName:'Our Danfe Cleaning Company' }));
  for (const path of ['/login','/account','/staff/login','/staff']) {
    const response = await site.fetch(new Request('https://a.test.example'+path, { headers:{ Host:'a.test.example' } }), env);
    assert.equal(response.status,200); assert.equal(response.headers.get('Cache-Control'),'no-store'); assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow');
    const html = await response.text(); assert.ok(html.includes('Our Danfe Cleaning Company'));
    assert.ok(html.includes(path.startsWith('/staff') ? 'Staff workspace' : 'Customer portal'));
  }
});

test('Danfe preset is tenant scoped, preserves other services, and generates distinct service pages and SEO', async () => {
  sql.prepare("INSERT INTO tenants(id,slug,business_name,vertical,subdomain) VALUES(?,?,?,?,?)").run('danfe','danfe','Our Danfe Cleaning Company','cleaning','danfe.test.example');
  sql.prepare("INSERT INTO tenant_users(id,tenant_id,name,email,password_hash,role) VALUES(?,?,?,?,?,?)").run('danfe-owner','danfe','Owner','owner@danfe.test.example',passwordHash,'owner');
  sql.prepare('INSERT INTO sites(id,tenant_id,template_key,draft_content) VALUES(?,?,?,?)').run('danfe-site','danfe','cleaning','{}');
  sql.prepare('INSERT INTO services(id,tenant_id,name,price) VALUES(?,?,?,?)').run('danfe-other','danfe','Existing custom service',88);
  const danfeOwner = await signAccessToken({ sub:'danfe-owner', tenant_id:'danfe', role:'owner' }, env.JWT_SECRET);
  assert.equal((await request('/api/sites/presets/danfe','POST',staff1)).status,403);
  assert.equal((await request('/api/sites/presets/danfe','POST',owner)).status,400);
  assert.equal((await request('/api/sites/presets/danfe','POST',danfeOwner)).status,200);
  assert.equal((await request('/api/sites/presets/danfe','POST',danfeOwner)).status,200);
  const rates:any[] = sql.prepare('SELECT price FROM services WHERE tenant_id=? ORDER BY price').all('danfe');
  assert.deepEqual(rates.map(r=>r.price),[25,35,88]);
  assert.equal((sql.prepare('SELECT price FROM services WHERE id=?').get('v1') as any).price,25);
  assert.equal((sql.prepare('SELECT live_content FROM sites WHERE id=?').get('danfe-site') as any).live_content,null);
  assert.equal((await request('/api/sites/publish','POST',danfeOwner)).status,200);
  for (const [path, keyword] of [['/','Cleaning Services in Sharjah'],['/services/hourly-cleaning','Hourly Cleaning'],['/services/cleaning-with-materials','Cleaning with Materials'],['/services/technical-services','Technical &amp; Maintenance']]) {
    const response = await site.fetch(new Request('https://danfe.test.example'+path,{ headers:{Host:'danfe.test.example'} }),env);
    assert.equal(response.status,200); const html=await response.text();
    assert.ok(html.includes(keyword)); assert.ok(html.includes(`href="https://danfe.test.example${path}"`));
    assert.ok(html.includes('/login')); assert.ok(html.includes('/staff/login'));
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(script[1]!);
    for (const script of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(script[1]!);
  }
  const sitemap = await site.fetch(new Request('https://danfe.test.example/sitemap.xml',{ headers:{Host:'danfe.test.example'} }),env);
  const xml=await sitemap.text(); assert.ok(xml.includes('/services/hourly-cleaning')); assert.ok(!xml.includes('/account'));
  const logo = await site.fetch(new Request('https://danfe.test.example/brand/danfe-logo.jpeg',{ headers:{Host:'danfe.test.example'} }),env);
  assert.equal(logo.status,200); assert.equal(logo.headers.get('Content-Type'),'image/jpeg'); assert.ok((await logo.arrayBuffer()).byteLength>10000);
});

test('owner can connect legacy staff logins; staff password change and logout revoke previous sessions', async () => {
  assert.equal((await request('/api/team/staff2/staff','PATCH',owner,{staff_id:'s3'})).status,404);
  assert.equal((await request('/api/team/staff2/staff','PATCH',owner,{staff_id:'s2'})).status,200);
  const token = await signAccessToken({sub:'staff2',tenant_id:'a',role:'staff',staff_id:'s2'},env.JWT_SECRET);
  assert.equal((await request('/staff-portal/password','POST',token,{current_password:'wrong',password:'new-secure-password'})).status,400);
  assert.equal((await request('/staff-portal/password','POST',token,{current_password:password,password:'new-secure-password'})).status,200);
  assert.equal((await request('/staff-portal/me','GET',token)).status,401);
  const login = await request('/public/staff-auth/login','POST','',{identifier:'staff2@test.example',password:'new-secure-password'});
  assert.equal(login.status,200); assert.equal((await request('/staff-portal/me','GET',login.body.accessToken)).status,200);
  assert.equal((await request('/staff-portal/logout','POST',login.body.accessToken)).status,200);
  assert.equal((await request('/staff-portal/me','GET',login.body.accessToken)).status,401);
});
