import type { CreatePaymentLinkInput, CreatePaymentLinkResult, PaymentGateway } from "./types";

/**
 * Telr's Hosted Payment Page (order/create) — the Gulf-market fallback
 * gateway alongside Razorpay/PhonePe. Ivp_method "create" returns a
 * hosted page URL directly, no separate checksum step for link creation;
 * the store's auth key alone authenticates the request.
 */
export function createTelrGateway(storeId: string, authKey: string): PaymentGateway {
  const baseUrl = "https://secure.telr.com/gateway/order.json";

  return {
    name: "telr",
    async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "create",
          store: storeId,
          authkey: authKey,
          order: {
            cartid: input.reference,
            test: "0",
            amount: input.amount.toFixed(2),
            currency: input.currency,
            description: input.description,
          },
          return: {
            authorised: input.redirectUrl ?? "",
            declined: input.redirectUrl ?? "",
            cancelled: input.redirectUrl ?? "",
          },
          customer: {
            name: { forenames: input.customerName ?? "Customer" },
            email: input.customerEmail,
            phone: input.customerPhone,
          },
        }),
      });
      if (!res.ok) return { ok: false, error: await res.text() };
      const json = (await res.json()) as { order?: { url?: string; ref?: string }; error?: { message: string } };
      if (json.error || !json.order?.url) return { ok: false, error: json.error?.message ?? "Telr order failed" };
      return { ok: true, paymentUrl: json.order.url, gatewayRef: json.order.ref };
    },
    async verifyCallback(_rawBody: string, headers: Record<string, string | null>): Promise<boolean> {
      // Telr's IPN callback is verified by calling back the order-status API with
      // the store/authkey rather than a request signature. Callers should treat
      // this as "well-formed" and confirm status server-side via order/check.
      return Boolean(headers["content-type"]?.includes("json"));
    },
  };
}
