import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { createDb, schema, verifyWebhookSignature, resolveTenantByPhoneNumberId, sendWhatsAppMessage } from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { processInboundText } from "../lib/bot-flow";
import { downloadWhatsAppMedia } from "../lib/wa-media";

/**
 * Single webhook for the shared WABA — Meta posts every message here
 * regardless of tenant/product, so phone_number_id is resolved to a
 * tenant before anything else runs (see wa_phone_mapping / router.ts).
 * Mounted outside tenant-host resolution since the host here is our own
 * webhook domain, not a tenant subdomain.
 */
export const whatsappWebhookRoute = new Hono<AppContext>();

whatsappWebhookRoute.get("/", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge");
  if (mode === "subscribe" && token === c.env.WA_VERIFY_TOKEN && challenge) {
    return c.text(challenge, 200);
  }
  return c.text("Forbidden", 403);
});

interface WaMessage {
  from: string;
  id: string;
  type: "text" | "audio" | "image" | "interactive" | string;
  text?: { body: string };
  audio?: { id: string; mime_type: string };
  image?: { id: string; mime_type: string; caption?: string };
}

interface WaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
        messages?: WaMessage[];
      };
    }>;
  }>;
}

async function getOrCreateConversation(db: ReturnType<typeof createDb>, tenantId: string, phone: string) {
  const [existing] = await db
    .select()
    .from(schema.whatsappConversations)
    .where(and(eq(schema.whatsappConversations.tenant_id, tenantId), eq(schema.whatsappConversations.customer_phone, phone)))
    .limit(1);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.insert(schema.whatsappConversations).values({ id, tenant_id: tenantId, customer_phone: phone, last_message_at: new Date().toISOString() });
  return id;
}

async function logMessage(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  conversationId: string,
  direction: "in" | "out",
  type: string,
  body: string | undefined,
  waMessageId?: string,
  mediaKey?: string
) {
  await db.insert(schema.whatsappMessages).values({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction,
    message_type: type,
    body,
    media_r2_key: mediaKey,
    wa_message_id: waMessageId,
  });
  await db.update(schema.whatsappConversations).set({ last_message_at: new Date().toISOString() }).where(eq(schema.whatsappConversations.id, conversationId));
}

whatsappWebhookRoute.post("/", async (c) => {
  const rawBody = await c.req.text();
  const signatureValid = await verifyWebhookSignature(rawBody, c.req.header("x-hub-signature-256") ?? null, c.env.WA_APP_SECRET);
  if (!signatureValid) return c.json({ error: "Invalid signature" }, 401);

  const payload = JSON.parse(rawBody) as WaWebhookPayload;
  const db = createDb(c.env.DB);

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const tenantId = await resolveTenantByPhoneNumberId(c.env.DB, phoneNumberId);
      if (!tenantId) continue; // unmapped number — nothing we can attribute this to

      const contactName = change.value?.contacts?.[0]?.profile?.name;

      for (const message of change.value?.messages ?? []) {
        const conversationId = await getOrCreateConversation(db, tenantId, message.from);
        let reply: string | null = null;

        if (message.type === "text" && message.text) {
          await logMessage(db, tenantId, conversationId, "in", "text", message.text.body, message.id);
          reply = await processInboundText(c.env, tenantId, message.from, contactName, message.text.body);
        } else if (message.type === "audio" && message.audio) {
          const media = await downloadWhatsAppMedia(c.env.WA_ACCESS_TOKEN, message.audio.id);
          let mediaKey: string | undefined;
          let transcript = "";
          if (media) {
            mediaKey = `${tenantId}/wa-audio/${message.id}`;
            await c.env.FILES.put(mediaKey, media.bytes, { httpMetadata: { contentType: media.mimeType } });
            if (c.env.AI) {
              try {
                const result = (await c.env.AI.run("@cf/openai/whisper", { audio: [...new Uint8Array(media.bytes)] })) as {
                  text?: string;
                };
                transcript = result.text ?? "";
              } catch {
                transcript = "";
              }
            }
          }
          await logMessage(db, tenantId, conversationId, "in", "audio", transcript || "[voice note]", message.id, mediaKey);
          reply = transcript
            ? await processInboundText(c.env, tenantId, message.from, contactName, transcript)
            : "Sorry, I couldn't understand that voice note — could you type your request instead?";
        } else if (message.type === "image" && message.image) {
          const media = await downloadWhatsAppMedia(c.env.WA_ACCESS_TOKEN, message.image.id);
          let mediaKey: string | undefined;
          if (media) {
            mediaKey = `${tenantId}/wa-photos/${message.id}`;
            await c.env.FILES.put(mediaKey, media.bytes, { httpMetadata: { contentType: media.mimeType } });
          }
          await logMessage(db, tenantId, conversationId, "in", "image", message.image.caption ?? "[photo]", message.id, mediaKey);
          // Photo-based quoting (spec §5/§10): give a rough estimate range from the image;
          // this is a first-pass heuristic prompt, not a trained pricing model.
          if (media && c.env.AI) {
            try {
              const vision = (await c.env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
                image: [...new Uint8Array(media.bytes)],
                prompt: "Describe the condition/scope of the job shown for a home service quote. One short sentence.",
              })) as { description?: string };
              reply = `Thanks for the photo! Based on what we can see (${vision.description ?? "your job"}), a team member will confirm an exact estimate shortly.`;
            } catch {
              reply = "Thanks for the photo — a team member will review it and send an estimate shortly.";
            }
          } else {
            reply = "Thanks for the photo — a team member will review it and send an estimate shortly.";
          }
        } else {
          // Unrecognized message type — escalate to a human rather than guess.
          await logMessage(db, tenantId, conversationId, "in", "text", "[unsupported message type]", message.id);
          reply = "Thanks for your message — one of our team will get back to you shortly.";
        }

        if (reply) {
          const sendResult = await sendWhatsAppMessage(c.env.WA_ACCESS_TOKEN, phoneNumberId, { to: message.from, body: reply });
          await logMessage(db, tenantId, conversationId, "out", "text", reply, sendResult.messageId);
        }
      }
    }
  }

  return c.json({ ok: true });
});
