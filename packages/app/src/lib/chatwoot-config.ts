import { createDb, schema, type Env, type ChatwootConfig } from "@serviceos/platform";
import { eq } from "drizzle-orm";
async function key(secret: string) {
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptToken(token: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(token)));
  return btoa(String.fromCharCode(...iv, ...data));
}
export async function getChatwootConfig(env: Env, tenantId: string): Promise<ChatwootConfig> {
  const [tenant] = await createDb(env.DB).select().from(schema.tenants).where(eq(schema.tenants.id, tenantId)).limit(1);
  if (!tenant?.chatwoot_account_id) throw new Error("Messaging is not connected");
  let token = env.CHATWOOT_AGENT_BOT_TOKEN;
  if (tenant.chatwoot_token_encrypted) {
    const bytes = Uint8Array.from(atob(tenant.chatwoot_token_encrypted), c => c.charCodeAt(0));
    token = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(env.JWT_SECRET), bytes.slice(12)));
  }
  return { baseUrl: tenant.chatwoot_token_encrypted ? "https://app.aiingo.com" : env.CHATWOOT_BASE_URL, apiAccessToken: token, accountId: tenant.chatwoot_account_id };
}
