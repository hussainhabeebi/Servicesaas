import type { CreatePaymentLinkInput, CreatePaymentLinkResult, PaymentGateway } from "./types";

export function createRazorpayGateway(keyId: string, keySecret: string): PaymentGateway {
  const basicAuth = btoa(`${keyId}:${keySecret}`);

  return {
    name: "razorpay",
    async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
      const res = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(input.amount * 100), // paise/fils-equivalent smallest unit
          currency: input.currency,
          description: input.description,
          reference_id: input.reference,
          customer: {
            name: input.customerName,
            contact: input.customerPhone,
            email: input.customerEmail,
          },
          notify: { sms: true, email: !!input.customerEmail },
          callback_url: input.redirectUrl,
          callback_method: "get",
        }),
      });
      if (!res.ok) return { ok: false, error: await res.text() };
      const json = (await res.json()) as { short_url: string; id: string };
      return { ok: true, paymentUrl: json.short_url, gatewayRef: json.id };
    },
    async verifyCallback(rawBody: string, headers: Record<string, string | null>): Promise<boolean> {
      const signature = headers["x-razorpay-signature"];
      if (!signature) return false;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(keySecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
      const expectedHex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
      return expectedHex === signature;
    },
  };
}
