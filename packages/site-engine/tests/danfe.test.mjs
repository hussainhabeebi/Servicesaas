import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script, runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the actual source with Web-standard Request/Response in Node.
// Temporary transpilation keeps tests independent of deployment credentials.
const temporary = await mkdtemp(join(tmpdir(), 'danfe-test-'));
await mkdir(join(temporary, 'danfe'));
const source = new URL('../src/', import.meta.url);
for (const file of ['danfe-worker.ts', ...(await readdir(new URL('danfe/', source))).filter(name => name.endsWith('.ts')).map(name => `danfe/${name}`)]) {
  const compiled = ts.transpileModule(await readFile(new URL(file, source), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  await writeFile(join(temporary, file.replace(/\.ts$/, '.mjs')), compiled.replace(/from '(\.[^']+)'/g, "from '$1.mjs'"));
}
after(() => rm(temporary, { recursive: true, force: true }));
const { handleDanfeRequest } = await import(pathToFileURL(join(temporary, 'danfe/handler.mjs')));
const worker = { fetch: handleDanfeRequest };
const { pages } = await import(pathToFileURL(join(temporary, 'danfe/content.mjs')));
const { isDanfeHost } = await import(pathToFileURL(join(temporary, 'danfe/handler.mjs')));
const get = (path, origin = 'https://www.danfecleaning.com', method = 'GET') => worker.fetch(new Request(origin + path, { method }));

test('every advertised page renders meaningful HTML, unique metadata, valid schema and working local links', async () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const page of pages) {
    const response = get(page.path);
    assert.equal(response.status, 200, page.path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, page.path);
    assert.match(html, new RegExp(`rel="canonical" href="https://www.danfecleaning.com${page.path}"`));
    assert.match(html, /<main id="main"[ >]/);
    assert.match(html, /Skip to content/);
    const title = html.match(/<title>(.*?)<\/title>/)[1];
    const description = html.match(/name="description" content="([^"]+)"/)[1];
    assert(!titles.has(title)); titles.add(title);
    assert(!descriptions.has(description)); descriptions.add(description);
    const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(data['@graph'][0].address.addressLocality, 'Sharjah');
    assert.deepEqual(data['@graph'][0].hasOfferCatalog.itemListElement.map(item => item.price), [25,35]);
    assert(!html.includes('AggregateRating'), 'No invented reviews');
    for (const [, href] of html.matchAll(/href="(\/[^"#?]*)(?:#[^"]*)?"/g)) assert.equal(get(href).status, 200, `${page.path}: ${href}`);
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert(html.includes(`id="${id}"`), `${page.path}: #${id}`);
  }
});

test('sitemap contains exactly canonical page URLs, no fragments or previews', async () => {
  const xml = await get('/sitemap.xml').text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, pages.filter(page => page.path !== '/bookings').map(page => 'https://www.danfecleaning.com' + page.path));
  assert(urls.every(url => !url.includes('#') && !url.includes('?')));
  const robots = await get('/robots.txt').text();
  assert.match(robots, /Sitemap: https:\/\/www.danfecleaning.com\/sitemap.xml/);
});

test('Dubai service pages have city-specific schema and private bookings stay outside indexing', async () => {
  const html = await get('/services/home-cleaning-dubai').text();
  assert.match(html, /Home cleaning in Dubai/);
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(data['@graph'].find(item => item['@type'] === 'Service').areaServed.name, 'Dubai');
  const privatePage = get('/bookings');
  assert.match(privatePage.headers.get('x-robots-tag'), /noindex/);
  assert.equal(privatePage.headers.get('cache-control'), 'no-store');
  assert.match(await privatePage.text(), /name="robots" content="noindex, nofollow"/);
  const manifest = await get('/manifest.webmanifest').json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(get(manifest.icons[0].src).status, 200);
});

test('published content and live one-hour prices appear in HTML and schema without script injection', async () => {
  const runtime = { connected: true, content: { businessName: 'Danfe & Company', heroText: '<script>unsafe</script>', phone: '+971 50 111 2222', address: 'Confirmed address', hours: 'Confirmed hours' }, services: [{id:'normal',category:'danfe_normal',duration_minutes:60,price:30,name:'Normal',description:null},{id:'materials',category:'danfe_materials',duration_minutes:60,price:45,name:'Materials',description:null}] };
  const html = await handleDanfeRequest(new Request('https://www.danfecleaning.com/'),runtime).text();
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(data['@graph'][0].name,'Danfe & Company');
  assert.deepEqual(data['@graph'][0].hasOfferCatalog.itemListElement.map(item=>item.price),[30,45]);
  assert.match(html, /AED 30/); assert.match(html, /AED 45/);
  assert(!html.includes('<script>unsafe</script>'));
  const settings = JSON.parse(html.match(/<script id="danfe-settings" type="application\/json">(.*?)<\/script>/s)[1]);
  assert.equal(settings.content.heroText,'<script>unsafe</script>');
  assert.equal(settings.content.businessName,'Danfe & Company');
});

test('canonical host redirects, trailing slashes, preview indexing, 404, HEAD and method handling', async () => {
  assert(isDanfeHost('danfecleaning.com'));
  assert(isDanfeHost('www.danfecleaning.com'));
  assert(!isDanfeHost('servbazaar.com'));
  assert(!isDanfeHost('another-tenant.servbazaar.com'));
  assert(!isDanfeHost('danfecleaning.com.attacker.test'));
  const redirect = get('/contact?x=1', 'https://danfecleaning.com');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), 'https://www.danfecleaning.com/contact?x=1');
  assert.equal(get('/contact/').headers.get('location'), '/contact');
  assert.equal(get('/contact', 'http://www.danfecleaning.com').status, 308);
  for (const response of [get('/?preview=1'), get('/', 'http://localhost:8787')]) {
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    assert.match(await response.text(), /name="robots" content="noindex, nofollow"/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.match(await get('/robots.txt', 'http://localhost:8787').text(), /Disallow: \//);
  assert.equal(get('/assets/danfe.css', 'http://localhost:8787').headers.get('cache-control'), 'no-store');
  assert.equal(get('/missing').status, 404);
  assert.equal(get('/services/missing').status, 404);
  assert.equal(get('/', undefined, 'POST').status, 405);
  assert.equal(await get('/', undefined, 'HEAD').text(), '');
});

test('original branding, CSS and JavaScript assets are delivered locally and cacheable', async () => {
  for (const path of ['/assets/danfe-logo.jpeg', '/assets/danfe-flyer.jpeg']) {
    const response = get(path);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8);
    assert(bytes.length < 250000);
    assert.match(response.headers.get('cache-control'), /max-age/);
  }
  const css = await get('/assets/danfe.css').text();
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  new Script(await get('/assets/danfe.js').text());
});

test('enquiry planner calculates both rates, handles specialist quotes and encodes WhatsApp details', async () => {
  const handlers = {};
  const values = { service: { value: 'Home cleaning' }, hours: { value: '3' }, materials: { value: 'Your materials' }, date: { value: '' }, location: { value: 'Al Majaz & near park' } };
  const output = { value: 'AED 75' };
  const breakdown = { textContent: '' };
  let destination;
  const form = { elements: { namedItem: name => values[name] }, addEventListener: (event, fn) => { handlers[event] = fn; }, reportValidity: () => true };
  runInNewContext(await get('/assets/danfe.js').text(), {
    document: { getElementById: id => ({ enquiry: form, estimate: output, 'estimate-detail': breakdown })[id] },
    window: { location: { assign: url => { destination = url; } } }, Intl, Date, encodeURIComponent,
  });
  assert.equal(output.value, 'AED 75');
  values.materials.value = 'With materials'; handlers.change();
  assert.equal(output.value, 'AED 105');
  values.hours.value = '8'; handlers.input();
  assert.equal(output.value, 'AED 280');
  values.service.value = 'Deep cleaning'; handlers.change();
  assert.equal(output.value, 'Quote required');
  handlers.submit({ preventDefault() {} });
  const url = new URL(destination);
  assert.equal(url.origin + url.pathname, 'https://wa.me/971562145676');
  assert.match(url.searchParams.get('text'), /Al Majaz & near park/);
  assert.match(url.searchParams.get('text'), /Quote required/);
  assert.match(values.date.min, /^\d{4}-\d{2}-\d{2}$/);
});
