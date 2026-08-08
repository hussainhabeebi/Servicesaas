import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  createDb,
  schema,
  resolveTenantByChatwootInboxId,
  verifyChatwootWebhookToken,
  sendChatwootReply,
  downloadChatwootAttachment,
  type ChatwootConfig,
} from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";
import { processInboundText } from "../lib/bot-flow";

/**
 * Single webhook endpoint for every tenant's Chatwoot inbox — each inbox is
 * configured in Chatwoot to POST here with a shared secret in the URL
 * (?token=...), since Chatwoot doesn't sign its webhook payloads the way
 * Meta does. `inbox.id` on the payload resolves to a tenant (see
 * chatwoot_inbox_id on the tenants table / admin.ts for how that's set).
 */
export const chatwootWebhookRoute = new Hono<AppContext>();

interface ChatwootAttachment {
  file_type: "image" | "audio" | "video" | "file" | string;
  data_url: string;
}

interface ChatwootWebhookPayload {
  event: string;
  id: number; // message id
  content?: string;
  message_type: "incoming" | "outgoing" | "template";
  private?: boolean;
  sender?: { id: number; name?: string; phone_number?: string; type?: string };
  conversation?: { id: number; inbox_id?: number };
  inbox?: { id: number };
  attachments?: ChatwootAttachment[];
}

async function getOrCreateConversation(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  phone: string,
  chatwootConversationId: number
) {
  const [existing] = await db
    .select()
    .from(schema.whatsappConversations)
    .where(and(eq(schema.whatsappConversations.tenant_id, tenantId), eq(schema.whatsappConversations.customer_phone, phone)))
    .limit(1);
  if (existing) {
    if (existing.chatwoot_conversation_id !== chatwootConversationId) {
      await db
        .update(schema.whatsappConversations)
        .set({ chatwoot_conversation_id: chatwootConversationId })
        .where(eq(schema.whatsappConversations.id, existing.id));
    }
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.insert(schema.whatsappConversations).values({
    id,
    tenant_id: tenantId,
    customer_phone: phone,
    chatwoot_conversation_id: chatwootConversationId,
    last_message_at: new Date().toISOString(),
  });
  return id;
}

async function logMessage(
  db: ReturnType<typeof createDb>,
  tenantId: string,
  conversationId: string,
  direction: "in" | "out",
  type: string,
  body: string | undefined,
  chatwootMessageId?: number,
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
    wa_message_id: chatwootMessageId != null ? String(chatwootMessageId) : undefined,
  });
  await db.update(schema.whatsappConversations).set({ last_message_at: new Date().toISOString() }).where(eq(schema.whatsappConversations.id, conversationId));
}

chatwootWebhookRoute.post("/", async (c) => {
  const providedToken = c.req.query("token") ?? null;
  if (!verifyChatwootWebhookToken(providedToken, c.env.CHATWOOT_WEBHOOK_TOKEN)) {
    return c.json({ error: "Invalid webhook token" }, 401);
  }

  const payload = (await c.req.json()) as ChatwootWebhookPayload;

  // Only react to genuine inbound customer messages — ignore our own bot's
  // outgoing replies echoing back, agent replies from the Chatwoot UI, and
  // private/internal notes.
  if (payload.event !== "message_created" || payload.message_type !== "incoming" || payload.private) {
    return c.json({ ok: true, skipped: true });
  }

  const inboxId = payload.inbox?.id ?? payload.conversation?.inbox_id;
  const conversationId = payload.conversation?.id;
  const phone = payload.sender?.phone_number;
  if (!inboxId || !conversationId || !phone) {
    return c.json({ ok: true, skipped: true });
  }

  const tenantId = await resolveTenantByChatwootInboxId(c.env.DB, inboxId);
  if (!tenantId) return c.json({ ok: true, skipped: true }); // unmapped inbox — nothing we can attribute this to

  const db = createDb(c.env.DB);
  const chatwootConfig: ChatwootConfig = {
    baseUrl: c.env.CHATWOOT_BASE_URL,
    apiAccessToken: c.env.CHATWOOT_API_TOKEN,
    accountId: c.env.CHATWOOT_ACCOUNT_ID,
  };

  const internalConversationId = await getOrCreateConversation(db, tenantId, phone, conversationId);
  const contactName = payload.sender?.name;
  const attachment = payload.attachments?.[0];
  let reply: string | null = null;

  if (attachment?.file_type === "audio") {
    const bytes = await downloadChatwootAttachment(attachment.data_url, c.env.CHATWOOT_API_TOKEN);
    let mediaKey: string | undefined;
    let transcript = "";
    if (bytes) {
      mediaKey = `${tenantId}/wa-audio/${payload.id}`;
      await c.env.FILES.put(mediaKey, bytes);
      if (c.env.AI) {
        try {
          const result = (await c.env.AI.run("@cf/openai/whisper", { audio: [...new Uint8Array(bytes)] })) as { text?: string };
          transcript = result.text ?? "";
        } catch {
          transcript = "";
        }
      }
    }
    await logMessage(db, tenantId, internalConversationId, "in", "audio", transcript || "[voice note]", payload.id, mediaKey);
    reply = transcript
      ? await processInboundText(c.env, tenantId, phone, contactName, transcript)
      : "Sorry, I couldn't understand that voice note — could you type your request instead?";
  } else if (attachment?.file_type === "image") {
    const bytes = await downloadChatwootAttachment(attachment.data_url, c.env.CHATWOOT_API_TOKEN);
    let mediaKey: string | undefined;
    if (bytes) {
      mediaKey = `${tenantId}/wa-photos/${payload.id}`;
      await c.env.FILES.put(mediaKey, bytes);
    }
    await logMessage(db, tenantId, internalConversationId, "in", "image", payload.content || "[photo]", payload.id, mediaKey);
    // Photo-based quoting (spec §5/§10): give a rough estimate range from the image;
    // this is a first-pass heuristic prompt, not a trained pricing model.
    if (bytes && c.env.AI) {
      try {
        const vision = (await c.env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", {
          image: [...new Uint8Array(bytes)],
          prompt: "Describe the condition/scope of the job shown for a home service quote. One short sentence.",
        })) as { description?: string };
        reply = `Thanks for the photo! Based on what we can see (${vision.description ?? "your job"}), a team member will confirm an exact estimate shortly.`;
      } catch {
        reply = "Thanks for the photo — a team member will review it and send an estimate shortly.";
      }
    } else {
      reply = "Thanks for the photo — a team member will review it and send an estimate shortly.";
    }
  } else if (payload.content) {
    await logMessage(db, tenantId, internalConversationId, "in", "text", payload.content, payload.id);
    reply = await processInboundText(c.env, tenantId, phone, contactName, payload.content);
  } else {
    await logMessage(db, tenantId, internalConversationId, "in", "text", "[unsupported message type]", payload.id);
    reply = "Thanks for your message — one of our team will get back to you shortly.";
  }

  if (reply) {
    const sendResult = await sendChatwootReply(chatwootConfig, conversationId, reply);
    await logMessage(db, tenantId, internalConversationId, "out", "text", reply, sendResult.messageId);
  }

  return c.json({ ok: true });
});
