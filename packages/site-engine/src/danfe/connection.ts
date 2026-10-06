import { and, eq } from 'drizzle-orm';
import { createDb, schema } from '@serviceos/platform';
import type { SiteContent } from '../templates/registry';

export const DANFE_TENANT_ID = '758794a2-6df0-4150-b160-4ab5cc7ae0ee';
export interface DanfeConnectionEnv { DB?: D1Database; API_BASE_URL?: string }
export interface DanfeRuntime { content?: SiteContent; services?: Array<{ id: string; name: string; category: string | null; price: number; duration_minutes: number; description: string | null }>; connected: boolean }

async function resolveDanfeRuntime(env: DanfeConnectionEnv): Promise<{ runtime: DanfeRuntime; siteHost?: string }> {
  if (!env.DB || !env.API_BASE_URL) return { runtime: { connected: false } };
  const db = createDb(env.DB);
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain, status: schema.tenants.status, businessName: schema.tenants.business_name, phone: schema.tenants.whatsapp_number, address: schema.tenants.address }).from(schema.tenants).where(eq(schema.tenants.id, DANFE_TENANT_ID)).limit(1);
  if (!tenant || tenant.status !== 'active') return { runtime: { connected: false } };
  const [site] = await db.select({ content: schema.sites.live_content }).from(schema.sites).where(eq(schema.sites.tenant_id, DANFE_TENANT_ID)).limit(1);
  const content = { businessName: tenant.businessName, ...(tenant.phone ? { phone: tenant.phone } : {}), ...(tenant.address ? { address: tenant.address } : {}), ...(site?.content ?? {}) } as SiteContent;
  if (content.design !== 'danfe') return { runtime: { connected: false } };
  const services = await db.select({ id: schema.services.id, name: schema.services.name, category: schema.services.category, price: schema.services.price, duration_minutes: schema.services.duration_minutes, description: schema.services.description }).from(schema.services).where(and(eq(schema.services.tenant_id, DANFE_TENANT_ID), eq(schema.services.active, true)));
  return { runtime: { connected: true, content, services }, siteHost: tenant.subdomain };
}

export async function getDanfeRuntime(env: DanfeConnectionEnv): Promise<{ runtime: DanfeRuntime; siteHost?: string }> {
  try { return await resolveDanfeRuntime(env); }
  catch { console.error('Danfe account data is unavailable'); return { runtime: { connected: false } }; }
}

/** Same-origin, allowlisted bridge; neither tenant identity nor upstream URL comes from the visitor. */
export async function proxyDanfeBooking(request: Request, env: DanfeConnectionEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice('/booking-api'.length);
  const allowed = request.method === 'GET' && (/^\/(storefront|services|suggestions\/best-slots)$/.test(path) || /^\/bookings\/[a-zA-Z0-9-]+\/details$/.test(path)) || request.method === 'POST' && (path === '/bookings' || /^\/bookings\/[a-zA-Z0-9-]+\/change-request$/.test(path));
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!allowed) return fail('This booking action is not supported', 404);
  const { runtime, siteHost } = await getDanfeRuntime(env);
  if (!runtime.connected || !siteHost || !env.API_BASE_URL) return fail('Online booking is being connected. Please contact Our Danfe on WhatsApp.', 503);
  const upstream = new URL(env.API_BASE_URL);
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.pathname !== '/') return fail('Booking connection is not configured correctly', 503);
  upstream.pathname = '/public' + path;
  upstream.search = url.search;
  const headers = new Headers({ 'X-Site-Host': siteHost, 'Content-Type': 'application/json' });
  const auth = request.headers.get('authorization');
  if (auth) headers.set('Authorization', auth);
  let body: string | undefined;
  if (request.method === 'POST') {
    const reader = request.body?.getReader();
    if (!reader) return fail('Missing booking details', 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.byteLength;
      if (length > 16384) { await reader.cancel(); return fail('Booking details are too long', 413); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    body = new TextDecoder().decode(bytes);
  }
  try {
    const response = await fetch(upstream, { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(10000) });
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch { return fail('ServBazaar could not be reached. Please retry or contact the team.', 502); }
}
