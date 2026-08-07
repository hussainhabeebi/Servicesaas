import { eq } from "drizzle-orm";
import { createDb, schema } from "../db/client";

/**
 * Shared WABA (Tech Provider/BSP) routes inbound webhooks for both
 * ServiceOS and Leadvyne through the same Meta app. `phone_number_id` on
 * the payload is the only signal that tells us which tenant — and which
 * product — owns the conversation, so this table is the routing source
 * of truth. Keep it in the platform layer so both products resolve the
 * same way.
 */
export async function resolveTenantByPhoneNumberId(db: D1Database, phoneNumberId: string): Promise<string | null> {
  const drizzleDb = createDb(db);
  const [row] = await drizzleDb
    .select({ tenant_id: schema.waPhoneMapping.tenant_id })
    .from(schema.waPhoneMapping)
    .where(eq(schema.waPhoneMapping.phone_number_id, phoneNumberId))
    .limit(1);
  return row?.tenant_id ?? null;
}

/** Verifies Meta's X-Hub-Signature-256 header against the raw request body. */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice(7);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actualHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

export interface WhatsAppOutboundText {
  to: string; // E.164
  body: string;
}

export interface WhatsAppOutboundTemplate {
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}

/** Sends a message via the Graph API using the tenant's routed phone_number_id. */
export async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  message: WhatsAppOutboundText | WhatsAppOutboundTemplate
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const body =
    "body" in message
      ? { messaging_product: "whatsapp", to: message.to, type: "text", text: { body: message.body } }
      : {
          messaging_product: "whatsapp",
          to: message.to,
          type: "template",
          template: {
            name: message.templateName,
            language: { code: message.languageCode },
            components: message.components ?? [],
          },
        };

  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, error: await res.text() };
  }
  const json = (await res.json()) as { messages?: Array<{ id: string }> };
  return { ok: true, messageId: json.messages?.[0]?.id };
}
