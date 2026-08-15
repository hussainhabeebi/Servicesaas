/**
 * Web Push (RFC 8291 message encryption + RFC 8292 VAPID) implemented from
 * scratch with Web Crypto only — no `web-push` npm package, since that
 * targets Node's crypto module and doesn't run on Workers. Used for booking
 * reminders / rebook nudges on tenant sites (site-engine), independent of
 * the WhatsApp channel.
 *
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are the standard raw base64url P-256
 * pair (65-byte uncompressed point / 32-byte private scalar) — the same
 * format `web-push generate-vapid-keys` produces, so that CLI works fine for
 * generating a pair even though nothing here depends on the package itself.
 */
import type { Env } from "@serviceos/platform";

function b64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Array<Uint8Array | number[]>): Uint8Array {
  const arrays = parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p)));
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource);
  return new Uint8Array(sig);
}

/** HKDF-Expand truncated to `length` bytes — a single iteration suffices since Web Push never needs more than 32 bytes of output. */
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const t1 = await hmacSha256(prk, concat(info, [1]));
  return t1.slice(0, length);
}

async function importEcdhPublicKey(rawPoint: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", rawPoint as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

interface EncryptedPush {
  body: Uint8Array;
  asPublicBytes: Uint8Array;
}

/** RFC 8291: derives the per-message content-encryption key/nonce and encrypts the payload as a single aes128gcm record. */
async function encryptPayload(uaPublicBytes: Uint8Array, authSecretBytes: Uint8Array, payload: Uint8Array): Promise<EncryptedPush> {
  // workers-types' SubtleCryptoDeriveKeyAlgorithm mistypes the spec's `public` field as `$public` —
  // the runtime (workerd's Web Crypto implementation) follows the actual Web Crypto spec, which uses `public`.
  const asKeyPair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublicBytes = new Uint8Array((await crypto.subtle.exportKey("raw", asKeyPair.publicKey)) as ArrayBuffer);

  const uaPublicKey = await importEcdhPublicKey(uaPublicBytes);
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey } as unknown as globalThis.SubtleCryptoDeriveKeyAlgorithm, asKeyPair.privateKey, 256)
  );

  const authInfo = concat(utf8("WebPush: info"), [0], uaPublicBytes, asPublicBytes);
  const prk = await hmacSha256(authSecretBytes, sharedSecret); // HKDF-Extract, salt = auth secret
  const ikm = await hkdfExpand(prk, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk2 = await hmacSha256(salt, ikm); // HKDF-Extract, salt = random per-message salt
  const cek = await hkdfExpand(prk2, concat(utf8("Content-Encoding: aes128gcm"), [0]), 16);
  const nonce = await hkdfExpand(prk2, concat(utf8("Content-Encoding: nonce"), [0]), 12);

  const cekKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const paddedPlaintext = concat(payload, [2]); // 0x02 delimiter = last (only) record, no extra padding
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, cekKey, paddedPlaintext as BufferSource));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  const header = concat(salt, recordSize, [asPublicBytes.length], asPublicBytes);
  return { body: concat(header, ciphertext), asPublicBytes };
}

async function importVapidPrivateKey(vapidPublicKey: string, vapidPrivateKey: string): Promise<CryptoKey> {
  const pub = b64urlDecode(vapidPublicKey); // 0x04 || x(32) || y(32)
  const d = b64urlDecode(vapidPrivateKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: b64urlEncode(d),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function signVapidJwt(env: Env, audience: string): Promise<string> {
  const key = await importVapidPrivateKey(env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: now + 12 * 3600, sub: env.VAPID_SUBJECT ?? "mailto:support@servbazaar.com" };
  const signingInput = `${b64urlEncode(utf8(JSON.stringify(header)))}.${b64urlEncode(utf8(JSON.stringify(payload)))}`;
  // WebCrypto's ECDSA signature is raw r||s (IEEE P1363), which is exactly what JOSE ES256 requires — no DER conversion needed.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(signingInput) as BufferSource);
  return `${signingInput}.${b64urlEncode(sig)}`;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendPushResult {
  ok: boolean;
  expired?: boolean; // true on 404/410 — caller should delete the stored subscription
}

/** Encrypts and delivers one Web Push message. Requires VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY to be configured; a tenant with no VAPID keys set simply can't send push (falls back silently — WhatsApp remains the primary channel). */
export async function sendWebPush(env: Env, subscription: PushSubscriptionInput, payload: { title: string; body: string; url?: string }): Promise<SendPushResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { ok: false };

  const uaPublicBytes = b64urlDecode(subscription.p256dh);
  const authSecretBytes = b64urlDecode(subscription.auth);
  const { body } = await encryptPayload(uaPublicBytes, authSecretBytes, utf8(JSON.stringify(payload)));

  const audience = new URL(subscription.endpoint).origin;
  const jwt = await signVapidJwt(env, audience);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    },
    body: body as BodyInit,
  });

  if (res.status === 404 || res.status === 410) return { ok: false, expired: true };
  return { ok: res.ok };
}
