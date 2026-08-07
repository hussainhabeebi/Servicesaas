import {
  createRazorpayGateway,
  createPhonePeGateway,
  createTelrGateway,
  createNetworkInternationalGateway,
  type PaymentGateway,
} from "@serviceos/platform";
import type { AppContext } from "@serviceos/platform";

export function getGateway(env: AppContext["Bindings"], name: string): PaymentGateway | null {
  switch (name) {
    case "razorpay":
      return env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
        ? createRazorpayGateway(env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET)
        : null;
    case "phonepe":
      return env.PHONEPE_MERCHANT_ID && env.PHONEPE_SALT_KEY
        ? createPhonePeGateway(env.PHONEPE_MERCHANT_ID, env.PHONEPE_SALT_KEY)
        : null;
    case "telr":
      return env.TELR_STORE_ID && env.TELR_AUTH_KEY ? createTelrGateway(env.TELR_STORE_ID, env.TELR_AUTH_KEY) : null;
    case "network_international":
      return env.NETWORK_INTL_MERCHANT_ID && env.NETWORK_INTL_API_KEY
        ? createNetworkInternationalGateway(env.NETWORK_INTL_MERCHANT_ID, env.NETWORK_INTL_API_KEY)
        : null;
    default:
      return null;
  }
}
