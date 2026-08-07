/**
 * Password hashing via Web Crypto PBKDF2 (available in the Workers runtime,
 * unlike bcrypt which needs native bindings). Format: pbkdf2$iterations$saltB64$hashB64
 */
const ITERATIONS = 100_000;

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveKey(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt.buffer as ArrayBuffer)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsStr, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterationsStr || !saltB64 || !hashB64) return false;
  const iterations = Number(iterationsStr);
  const salt = fromB64(saltB64);
  const computed = await deriveKey(password, salt, iterations);
  const expected = fromB64(hashB64);
  const actual = new Uint8Array(computed);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}
