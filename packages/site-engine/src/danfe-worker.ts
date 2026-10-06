import { handleDanfeRequest } from './danfe/handler';
import { getDanfeRuntime, proxyDanfeBooking, type DanfeConnectionEnv } from './danfe/connection';

/** Independent company site, sharing the platform's rendering package without requiring tenant data. */
export default {
  async fetch(request: Request, env: DanfeConnectionEnv = {}): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/booking-api/')) return proxyDanfeBooking(request, env);
    if (/^\/(assets\/|robots\.txt$|sitemap\.xml$|manifest\.webmanifest$)/.test(new URL(request.url).pathname)) return handleDanfeRequest(request);
    const { runtime } = await getDanfeRuntime(env);
    return handleDanfeRequest(request, runtime);
  },
} satisfies ExportedHandler<DanfeConnectionEnv>;
