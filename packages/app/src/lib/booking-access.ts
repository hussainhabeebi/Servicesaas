/** Customer capabilities are deliberately not staff/tenant login JWTs. */
const encode = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (value: string) => atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
async function key(secret: string) {
  if (!secret) throw new Error('Booking access is not configured');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(`booking-access:v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function issueBookingAccess(tenantId: string, bookingId: string, secret: string, ttl = 7 * 86400) {
  const payload = encode(JSON.stringify({ scope: 'customer_booking', tenantId, bookingId, expires: Math.floor(Date.now() / 1000) + ttl }));
  const signature = await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(payload));
  return `${payload}.${encode(String.fromCharCode(...new Uint8Array(signature)))}`;
}
export async function verifyBookingAccess(token: string, tenantId: string, bookingId: string, secret: string): Promise<boolean> {
  try {
    if (!token || token.length > 2048) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [payload, signature] = parts;
    const valid = await crypto.subtle.verify('HMAC', await key(secret), Uint8Array.from(decode(signature!), char => char.charCodeAt(0)), new TextEncoder().encode(payload!));
    if (!valid) return false;
    const claims = JSON.parse(decode(payload!));
    return claims.scope === 'customer_booking' && claims.tenantId === tenantId && claims.bookingId === bookingId && Number.isFinite(claims.expires) && claims.expires > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
