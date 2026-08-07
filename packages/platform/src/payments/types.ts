export interface CreatePaymentLinkInput {
  amount: number; // in the currency's smallest unit is gateway-specific; wrappers normalize
  currency: string; // "AED"
  reference: string; // invoice_id or invoice_number
  description: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  redirectUrl?: string;
}

export interface CreatePaymentLinkResult {
  ok: boolean;
  paymentUrl?: string;
  gatewayRef?: string;
  error?: string;
}

export interface PaymentGateway {
  name: "razorpay" | "phonepe" | "telr" | "network_international";
  createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult>;
  /** Verifies a webhook/callback payload's authenticity for this gateway. */
  verifyCallback(rawBody: string, headers: Record<string, string | null>): Promise<boolean>;
}
