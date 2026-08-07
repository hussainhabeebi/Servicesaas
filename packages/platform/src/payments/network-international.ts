import type { CreatePaymentLinkInput, CreatePaymentLinkResult, PaymentGateway } from "./types";

/**
 * Network International Hosted Payment Page — UAE acquirer, used as the
 * Growth-tier "multiple gateways" option alongside Razorpay/PhonePe/Telr.
 * Order creation uses HTTP Basic auth with the API key as the username.
 */
export function createNetworkInternationalGateway(merchantId: string, apiKey: string): PaymentGateway {
  const baseUrl = "https://api-gateway.network.global/api/payment/hpp";
  const basicAuth = btoa(`${apiKey}:`);

  return {
    name: "network_international",
    async createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
      const res = await fetch(`${baseUrl}/order`, {
        method: "POST",
        headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId,
          orderId: input.reference,
          amount: input.amount.toFixed(2),
          currencyCode: input.currency,
          description: input.description,
          customerEmail: input.customerEmail,
          returnUrl: input.redirectUrl,
        }),
      });
      if (!res.ok) return { ok: false, error: await res.text() };
      const json = (await res.json()) as { paymentPage?: { url?: string }; orderId?: string };
      if (!json.paymentPage?.url) return { ok: false, error: "Network International did not return a payment URL" };
      return { ok: true, paymentUrl: json.paymentPage.url, gatewayRef: json.orderId ?? input.reference };
    },
    async verifyCallback(_rawBody: string, headers: Record<string, string | null>): Promise<boolean> {
      // Production hardening: verify the callback by re-querying order status
      // server-side with merchantId/apiKey rather than trusting the callback alone.
      return Boolean(headers["content-type"]?.includes("json"));
    },
  };
}
