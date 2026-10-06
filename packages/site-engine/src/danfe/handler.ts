import { DANFE_ORIGIN, pages } from './content';
import { logoBase64, flyerBase64 } from './assets';
import { styles } from './styles';
import { clientScript } from './client';
import { bookingClientScript } from './booking-client';
import { renderDanfePage } from './render';
import type { DanfeRuntime } from './connection';

export function isDanfeHost(hostname: string): boolean {
  return hostname === 'www.danfecleaning.com' || hostname === 'danfecleaning.com';
}

function imageBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function handleDanfeRequest(request: Request, runtime: DanfeRuntime = { connected: false }): Response {
  const url = new URL(request.url);
  const preview = !isDanfeHost(url.hostname) || url.searchParams.get('preview') === '1';
  const headers = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action https://wa.me",
  });
  if (preview) headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('Allow', 'GET, HEAD');
    return new Response('Method not allowed', { status: 405, headers });
  }
  if (isDanfeHost(url.hostname) && url.origin !== DANFE_ORIGIN) {
    headers.set('Location', DANFE_ORIGIN + url.pathname + url.search);
    return new Response(null, { status: 308, headers });
  }
  const path = url.pathname;
  if (path !== '/' && path.endsWith('/') && pages.some(page => page.path === path.slice(0, -1))) {
    headers.set('Location', path.slice(0, -1) + url.search);
    return new Response(null, { status: 308, headers });
  }
  let body: string | Uint8Array;
  let status = 200;
  headers.set('Cache-Control', preview ? 'no-store' : 'public, max-age=300');
  if (path === '/assets/danfe-logo.jpeg' || path === '/assets/danfe-flyer.jpeg') {
    body = imageBytes(path.endsWith('logo.jpeg') ? logoBase64 : flyerBase64);
    headers.set('Content-Type', 'image/jpeg');
    headers.set('Cache-Control', preview ? 'no-store' : 'public, max-age=86400');
  } else if (path === '/assets/danfe.css' || path === '/assets/danfe.js') {
    body = path.endsWith('.css') ? styles : clientScript + bookingClientScript;
    headers.set('Content-Type', path.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8');
    headers.set('Cache-Control', preview ? 'no-store' : 'public, max-age=3600');
  } else if (path === '/manifest.webmanifest') {
    body = JSON.stringify({ id: '/', name: 'Our Danfe Cleaning', short_name: 'Danfe', start_url: '/', scope: '/', display: 'standalone', background_color: '#f5f5fa', theme_color: '#25246b', icons: [{ src: '/assets/danfe-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }] });
    headers.set('Content-Type', 'application/manifest+json');
  } else if (path === '/assets/danfe-icon.svg') {
    body = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="110" fill="#25246b"/><circle cx="370" cy="115" r="35" fill="#c81560"/><text x="256" y="360" text-anchor="middle" font-family="Arial,sans-serif" font-size="300" font-weight="bold" fill="white">D</text></svg>';
    headers.set('Content-Type', 'image/svg+xml');
  } else if (path === '/robots.txt') {
    body = preview ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /*?preview=\nSitemap: ${DANFE_ORIGIN}/sitemap.xml\n`;
    headers.set('Content-Type', 'text/plain; charset=utf-8');
  } else if (path === '/sitemap.xml') {
    body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.filter(page => page.path !== '/bookings').map(page => `<url><loc>${DANFE_ORIGIN}${page.path}</loc></url>`).join('')}</urlset>`;
    headers.set('Content-Type', 'application/xml; charset=utf-8');
  } else {
    const html = renderDanfePage(path, preview, runtime);
    body = html ?? '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Our Danfe</title><link rel="stylesheet" href="/assets/danfe.css"><main class="wrap section"><h1>Page not found.</h1><p>The requested page could not be found.</p><a class="button" href="/">Back to Our Danfe</a></main></html>';
    status = html ? 200 : 404;
    if (!html) headers.set('X-Robots-Tag', 'noindex');
    if (path === '/bookings') { headers.set('X-Robots-Tag', 'noindex, nofollow'); headers.set('Cache-Control', 'no-store'); }
    headers.set('Content-Type', 'text/html; charset=utf-8');
    if (runtime.connected) headers.set('Cache-Control', 'no-store');
  }
  return new Response(request.method === 'HEAD' ? null : body, { status, headers });
}
