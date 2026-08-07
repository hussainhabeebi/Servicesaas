import type { CreatePaymentLinkInput, CreatePaymentLinkResult, PaymentGateway } from "./types";

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * PhonePe's PG API signs each request as
 * SHA256(base64(payload) + apiPath + saltKey) + "###" + saltIndex.
 * Kept as its own wrapper (rather than folding into Razorpay) because the
 * checksum + base64-payload scheme is materially different from bearer auth.
 */
export function createPhonePeGateway(merchantId: string, saltKey: string, saltIndex = 1): PaymentGateway {
  const apiPath = "/pg/v1/pay";
  const baseUrl = "https://api.phonepe.com/apis/hermes";

  return {
    name: "phonepe",
    async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
      const payload = {
        merchantId,
        merchantTransactionId: input.reference,
        merchantUserId: input.customerPhone ?? "guest",
        amount: Math.round(input.amount * 100),
        redirectUrl: input.redirectUrl ?? "",
        redirectMode: "REDIRECT",
        mobileNumber: input.customerPhone,
        paymentInstrument: { type: "PAY_PAGE" },
      };
      const base64Payload = toB64(new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer);
      const checksum = (await sha256Hex(base64Payload + apiPath + saltKey)) + "###" + saltIndex;

      const res = await fetch(`${baseUrl}${apiPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-VERIFY": checksum },
        body: JSON.stringify({ request: base64Payload }),
      });
      if (!res.ok) return { ok: false, error: await res.text() };
      const json = (await res.json()) as {
        success: boolean;
        data?: { instrumentResponse?: { redirectInfo?: { url: string } } };
      };
      const url = json.data?.instrumentResponse?.redirectInfo?.url;
      if (!json.success || !url) return { ok: false, error: "PhonePe did not return a redirect URL" };
      return { ok: true, paymentUrl: url, gatewayRef: input.reference };
    },
    async verifyCallback(rawBody: string, headers: Record<string, string | null>): Promise<boolean> {
      const receivedChecksum = headers["x-verify"];
      if (!receivedChecksum) return false;
      const expected = (await sha256Hex(rawBody + saltKey)) + "###" + saltIndex;
      return expected === receivedChecksum;
    },
  };
}
