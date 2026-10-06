import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdtemp, rm, stat, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const require = createRequire(await realpath(new URL('../node_modules/wrangler/package.json', import.meta.url)));
const esbuild = require('esbuild');
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'danfe-integration-'));
after(() => rm(temporary, { recursive: true, force: true }));
await esbuild.build({
  stdin: { contents: `export { publicRoute } from './src/routes/public.ts'; export { adminRoute } from './src/routes/admin.ts'; export { bookingsRoute } from './src/routes/bookings.ts'; export * from './src/lib/booking-access.ts'; export { getDanfeRuntime, proxyDanfeBooking } from '../site-engine/src/danfe/connection.ts'; export { Hono } from 'hono';`, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', target: 'es2022', logLevel: 'silent', outfile: join(temporary, 'routes.mjs'),
  plugins: [{ name: 'workspace-files', setup(build) {
    build.onResolve({ filter: /.*/ }, async args => {
      if (args.path.startsWith('node:')) return { path: args.path, external: true };
      const base = args.resolveDir || appRoot;
      let path;
      if (args.path.startsWith('.') || /^[A-Z]:/i.test(args.path)) {
        const requested = resolve(base, args.path);
        for (const candidate of [requested, requested + '.ts', requested + '.js', join(requested, 'index.ts'), join(requested, 'index.js')]) { try { if ((await stat(candidate)).isFile()) { path = candidate; break; } } catch {} }
        if (!path) throw new Error('Cannot resolve ' + requested);
      } else path = createRequire(join(base, 'package.json')).resolve(args.path);
      return { path, namespace: 'workspace' };
    });
    build.onLoad({ filter: /.*/, namespace: 'workspace' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: args.path.endsWith('.json') ? 'json' : args.path.endsWith('.ts') ? 'ts' : 'js', resolveDir: dirname(args.path) }));
  }}],
}).catch(error => { throw new Error((error.errors ?? []).slice(0,3).map(item => item.text).join('\n')); });
const { publicRoute, adminRoute, bookingsRoute, issueBookingAccess, verifyBookingAccess, getDanfeRuntime, proxyDanfeBooking, Hono } = await import(pathToFileURL(join(temporary, 'routes.mjs')));
const sqlite = new DatabaseSync(':memory:');
after(() => sqlite.close());
for (const file of (await readdir(join(appRoot, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(await readFile(join(appRoot, 'migrations', file), 'utf8'));
// D1 compatibility adapter backed by real SQLite, so Drizzle queries and writes
// are exercised rather than replaced with an in-memory record mock.
const DB = { prepare(sql) {
  let values = [];
  const statement = sqlite.prepare(sql);
  const prepared = {
    bind(...args) { values = args; return prepared; },
    async all() { return { success: true, results: statement.all(...values) }; },
    async raw() { statement.setReturnArrays(true); return statement.all(...values); },
    async run() { return { success: true, meta: statement.run(...values) }; },
  }; return prepared;
} };
const tenant = '758794a2-6df0-4150-b160-4ab5cc7ae0ee';
const secret = 'test-only-secret-with-no-production-access';
sqlite.prepare("INSERT INTO tenants (id,slug,business_name,vertical,subdomain,status) VALUES (?,?,?,?,?,?)").run(tenant, 'danfe', 'Danfe Cleaning Company', 'cleaning', 'danfe.servbazaar.com', 'active');
sqlite.prepare("INSERT INTO admin_users (id,name,email,password_hash) VALUES ('admin-test','Test','test@example.test','not-used')").run();
const env = { DB, JWT_SECRET: secret, API_BASE_URL: 'https://api.servbazaar.com' };
const app = new Hono();
app.use('*', async (c, next) => { c.set('tenantId', tenant); c.set('tenantRole', 'owner'); c.set('adminUserId', 'admin-test'); return next(); });
app.route('/public', publicRoute); app.route('/admin', adminRoute); app.route('/api/bookings', bookingsRoute);
const request = (path, method='GET', data, token) => app.request(path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(data ? {body:JSON.stringify(data)} : {}) }, env);

test('private capabilities enforce tenant, booking, signature, secret and expiry boundaries', async () => {
  const token = await issueBookingAccess(tenant,'booking-a',secret);
  assert(await verifyBookingAccess(token,tenant,'booking-a',secret));
  for (const [candidate, account, booking, key] of [[token,'other','booking-a',secret],[token,tenant,'other',secret],[token+'x',tenant,'booking-a',secret],[token,tenant,'booking-a','other'],['malformed',tenant,'booking-a',secret],[await issueBookingAccess(tenant,'booking-a',secret,-1),tenant,'booking-a',secret]]) assert.equal(await verifyBookingAccess(candidate,account,booking,key),false);
});

test('admin connects only Danfe, preserves existing prices on retry and requires publication', async () => {
  assert.equal((await request('/admin/tenants/other/danfe/connect','POST')).status,403);
  assert.equal((await request('/admin/tenants/'+tenant+'/danfe/connect','POST')).status,200);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM services').get().n,16);
  assert.equal((await getDanfeRuntime(env)).runtime.connected,false);
  sqlite.prepare("UPDATE services SET price=88 WHERE category='danfe_normal' AND duration_minutes=180").run();
  await request('/admin/tenants/'+tenant+'/danfe/connect','POST');
  assert.equal(sqlite.prepare("SELECT price FROM services WHERE category='danfe_normal' AND duration_minutes=180").get().price,88);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM services').get().n,16);
  await request('/admin/tenants/'+tenant+'/site/publish','POST');
  assert.equal((await getDanfeRuntime(env)).runtime.connected,true);
});

test('website booking creates CRM/address/job records; app status and invoice changes return to the customer', async () => {
  const serviceId = 'danfe-'+tenant+'-normal-3';
  const start = new Date(Date.now()+3*86400000).toISOString();
  assert.equal((await request('/public/bookings','POST',{service_id:serviceId,customer_name:'Test customer',customer_phone:'+971501234567',scheduled_start:'invalid'})).status,400);
  const response = await request('/public/bookings','POST',{service_id:serviceId,customer_name:'Test customer',customer_phone:'+971 50 123 4567',address_line:'Test apartment',area:'Dubai, Al Barsha',scheduled_start:start});
  assert.equal(response.status,201); const created = await response.json();
  assert.equal(new Date(created.scheduled_end)-new Date(start),3*3600000);
  assert.equal(sqlite.prepare('SELECT source FROM bookings WHERE id=?').get(created.id).source,'website');
  assert.equal(sqlite.prepare('SELECT phone FROM customers').get().phone,'+971501234567');
  assert.equal(sqlite.prepare('SELECT area FROM customer_addresses').get().area,'Dubai, Al Barsha');
  assert.equal((await request('/public/bookings/'+created.id+'/details')).status,401);
  const details = await request('/public/bookings/'+created.id+'/details','GET',null,created.accessToken);
  assert.equal(details.status,200); assert.equal(details.headers.get('cache-control'),'no-store');
  const otherToken=await issueBookingAccess(tenant,'different-booking',secret);
  assert.equal((await request('/public/bookings/'+created.id+'/details','GET',null,otherToken)).status,401);
  const change=await request('/public/bookings/'+created.id+'/change-request','POST',{kind:'reschedule',preferred_start:new Date(Date.now()+5*86400000).toISOString(),reason:'Test request'},created.accessToken);
  assert.equal(change.status,202); assert.equal(sqlite.prepare("SELECT count(*) AS n FROM tasks WHERE type='general' AND title='Customer requests reschedule'").get().n,1);
  assert.equal((await request('/public/bookings/'+created.id+'/change-request','POST',{kind:'cancel',reason:'Test duplicate'},created.accessToken)).status,409);
  await request('/api/bookings/'+created.id+'/status','POST',{status:'completed'});
  const invoice=sqlite.prepare('SELECT status,total FROM invoices WHERE booking_id=?').get(created.id);
  assert.equal(invoice.status,'draft'); assert(invoice.total>0);
  assert.equal((await (await request('/public/bookings/'+created.id+'/details','GET',null,created.accessToken)).json()).invoices.length,0);
  sqlite.prepare("UPDATE invoices SET status='paid',amount_paid=total WHERE booking_id=?").run(created.id);
  const updated=await (await request('/public/bookings/'+created.id+'/details','GET',null,created.accessToken)).json();
  assert.equal(updated.booking.status,'completed');assert.equal(updated.invoices[0].status,'paid');
  assert(!('notes' in updated.booking));assert(!('customer_phone' in updated.booking));
});

test('bridge rejects arbitrary destinations and disconnected accounts', async () => {
  assert.equal((await proxyDanfeBooking(new Request('https://www.danfecleaning.com/booking-api/admin/tenants'),env)).status,404);
  assert.equal((await proxyDanfeBooking(new Request('https://www.danfecleaning.com/booking-api/storefront'),{})).status,503);
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url.origin,'https://api.servbazaar.com');
      assert.equal(url.pathname,'/public/storefront');
      assert.equal(options.headers.get('x-site-host'),'danfe.servbazaar.com');
      assert.equal(options.redirect,'error');
      return Response.json({services:[]});
    };
    const proxied = await proxyDanfeBooking(new Request('https://www.danfecleaning.com/booking-api/storefront',{headers:{'X-Site-Host':'attacker.servbazaar.com'}}),env);
    assert.equal(proxied.status,200); assert.equal(proxied.headers.get('cache-control'),'no-store');
    const oversized = await proxyDanfeBooking(new Request('https://www.danfecleaning.com/booking-api/bookings',{method:'POST',body:'x'.repeat(17000)}),env);
    assert.equal(oversized.status,413);
  } finally {globalThis.fetch=previousFetch;}
  sqlite.prepare("UPDATE tenants SET status='suspended' WHERE id=?").run(tenant);
  assert.equal((await getDanfeRuntime(env)).runtime.connected,false);
});
