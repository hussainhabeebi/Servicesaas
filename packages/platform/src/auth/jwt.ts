/**
 * Minimal HS256 JWT sign/verify using Web Crypto (no external deps — keeps
 * the Worker bundle small and avoids Node-only crypto APIs).
 */
export interface AccessTokenClaims {
  sub: string; // tenant_user_id
  tenant_id: string;
  role: "owner" | "staff" | "admin";
  exp: number;
  iat: number;
}

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signAccessToken(
  claims: Omit<AccessTokenClaims, "exp" | "iat">,
  secret: string,
  ttlSeconds = 60 * 60 * 12
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenClaims = { ...claims, iat: now, exp: now + ttlSeconds };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(sig)}`;
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessTokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encHeader, encPayload, encSig] = parts;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlDecode(encSig!) as BufferSource,
    new TextEncoder().encode(`${encHeader}.${encPayload}`)
  );
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(encPayload!))) as AccessTokenClaims;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
