/**
 * Thin fetch-based Gemini client — no SDK needed, keeps the Worker bundle
 * small. Model name is configurable (GEMINI_MODEL) since Gemini model IDs
 * change over time; verify the current one works before relying on it.
 */
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function generateContent(apiKey: string, model: string, parts: unknown[], responseSchema?: object): Promise<string | null> {
  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      ...(responseSchema ? { generationConfig: { responseMimeType: "application/json", responseSchema } } : {}),
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

/** Voice-note booking (spec §5/§10) — transcribes a WhatsApp voice note. */
export async function geminiTranscribeAudio(apiKey: string, model: string, bytes: ArrayBuffer, mimeType: string): Promise<string> {
  const text = await generateContent(apiKey, model, [
    { text: "Transcribe this voice note exactly as spoken. Reply with only the transcript, no commentary." },
    { inline_data: { mime_type: mimeType, data: toBase64(bytes) } },
  ]);
  return text?.trim() ?? "";
}

/** Photo-based quoting (spec §5/§10) — describes a job photo for a rough estimate. */
export async function geminiDescribeImage(apiKey: string, model: string, bytes: ArrayBuffer, mimeType: string, prompt: string): Promise<string> {
  const text = await generateContent(apiKey, model, [
    { text: prompt },
    { inline_data: { mime_type: mimeType, data: toBase64(bytes) } },
  ]);
  return text?.trim() ?? "";
}

export interface BookingIntentExtraction {
  serviceMatchIndex: number | null; // index into the services list passed in, or null if nothing fits
  isCustomRequest: boolean;
  area: string | null;
  preferredDateTimeIso: string | null; // absolute ISO datetime, resolved from relative phrasing like "tomorrow 2pm"
  mood: "hot" | "warm" | "neutral" | "cold";
  confirmsBooking: boolean;
}

const BOOKING_INTENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    serviceMatchIndex: { type: "INTEGER", nullable: true },
    isCustomRequest: { type: "BOOLEAN" },
    area: { type: "STRING", nullable: true },
    preferredDateTimeIso: { type: "STRING", nullable: true },
    mood: { type: "STRING", enum: ["hot", "warm", "neutral", "cold"] },
    confirmsBooking: { type: "BOOLEAN" },
  },
  required: ["isCustomRequest", "mood", "confirmsBooking"],
};

/**
 * Single extraction call used at every stage of the WhatsApp booking flow
 * (bot-flow.ts) — replaces the old regex date parser and LIKE-based
 * service matching with actual language understanding. Callers only read
 * the fields relevant to their current step; irrelevant ones come back
 * null/false rather than guessed.
 */
export async function geminiExtractBookingIntent(
  apiKey: string,
  model: string,
  params: {
    latestMessage: string;
    contextNote?: string; // e.g. what the customer said earlier about the service they need
    services: Array<{ name: string; category: string | null }>;
    nowIso: string;
    timezone: string;
    focusHint: string; // what this step of the conversation is expecting from the customer
  }
): Promise<BookingIntentExtraction | null> {
  const prompt = `You are parsing a WhatsApp message from a customer of a local service business.
${params.focusHint}
Current date/time: ${params.nowIso} (timezone: ${params.timezone}).
Available services (index: name/category): ${params.services.map((s, i) => `${i}: ${s.name} (${s.category ?? "general"})`).join("; ")}.
${params.contextNote ? `${params.contextNote}\n` : ""}Customer's latest message: "${params.latestMessage}"

Extract:
- serviceMatchIndex: index of the best-matching service from the list above, or null if nothing fits well.
- isCustomRequest: true if this sounds like a custom/large job that doesn't fit a standard listed service.
- area: the neighbourhood/area mentioned, or null.
- preferredDateTimeIso: if a date/time is mentioned (even relative, like "tomorrow 2pm" or "next Monday morning"), resolve it to an absolute ISO 8601 datetime using the current date/time and timezone given above; otherwise null.
- mood: "hot" if urgent/ASAP language, "warm" if soon/this week, "cold" if vague/just browsing, otherwise "neutral".
- confirmsBooking: true if the message is a simple confirmation (yes, ok, confirm, sounds good, that works).`;

  const text = await generateContent(apiKey, model, [{ text: prompt }], BOOKING_INTENT_SCHEMA);
  if (!text) return null;
  try {
    return JSON.parse(text) as BookingIntentExtraction;
  } catch {
    return null;
  }
}
