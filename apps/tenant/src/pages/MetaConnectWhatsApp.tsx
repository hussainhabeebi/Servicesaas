import { useEffect, useState } from "react";
import { api } from "../api";
import { pageTitle, card, btnPrimary } from "../ui";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
      login(
        callback: (response: { authResponse?: { code?: string } }) => void,
        opts: { config_id: string; response_type: string; override_default_response_type: boolean; extras: Record<string, unknown> }
      ): void;
    };
  }
}

type OnboardingType = "coexistence" | "new_number";

/**
 * Meta's Embedded Signup, with WhatsApp Business app "coexistence" support
 * (a business that already runs WhatsApp Business on their phone keeps
 * using it — nothing gets deregistered — while ServBazaar's bot also
 * connects to the same number via the Cloud API). This is what makes
 * onboarding painless for an owner who doesn't want to lose their existing
 * number, chat history, or contacts just to get automation.
 *
 * Meta decides, per phone number, whether coexistence is even possible
 * (only offered if the number is already active in the consumer app) — we
 * don't choose the path up front, we just read which one Meta's flow
 * completed via the postMessage event type it sends back. The exact event
 * name strings below match Meta's Embedded Signup docs as of when this was
 * written; if Meta renames them in a future API version, worst case is the
 * connection still succeeds but onboarding_type (support/analytics only,
 * not functional) comes back unset — see the fallback branch.
 */
export function ConnectWhatsAppPage() {
  const [status, setStatus] = useState<{ connected: boolean; whatsappNumber: string | null; onboardingType: OnboardingType | null } | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<{ metaAppId: string | null; embeddedSignupConfigId: string | null } | null>(null);

  useEffect(() => {
    api.whatsappStatus().then(setStatus).catch(() => {});
    api.whatsappConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (!config?.metaAppId || window.FB) {
      if (window.FB) setSdkReady(true);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: config.metaAppId!, autoLogAppEvents: true, xfbml: true, version: "v21.0" });
      setSdkReady(true);
    };
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, [config]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      let data: { type?: string; event?: string; data?: { phone_number_id?: string; waba_id?: string } };
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (data.event === "CANCEL") {
        setConnecting(false);
        setError("Signup was cancelled — you can try again anytime.");
      }
      // FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING = kept the WhatsApp Business
      // app (coexistence). FINISH_ONLY_WABA / FINISH = fresh Cloud API
      // number. Stash whichever we saw; the code exchange below reads it.
      if (data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
        lastOnboardingType = "coexistence";
      } else if (data.event === "FINISH_ONLY_WABA" || data.event === "FINISH") {
        lastOnboardingType = "new_number";
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function startConnect() {
    if (!window.FB || !config?.embeddedSignupConfigId) return;
    setConnecting(true);
    setError(null);
    lastOnboardingType = undefined;

    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setConnecting(false);
          setError("Didn't receive a connection code from Meta — please try again.");
          return;
        }
        try {
          const result = await api.whatsappConnect({ code, onboardingType: lastOnboardingType });
          setStatus({ connected: true, whatsappNumber: result.whatsappNumber, onboardingType: lastOnboardingType ?? null });
        } catch (e) {
          setError(String(e));
        } finally {
          setConnecting(false);
        }
      },
      {
        config_id: config.embeddedSignupConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    );
  }

  if (status?.connected) {
    return (
      <div>
        <h1 style={pageTitle}>WhatsApp</h1>
        <div style={{ ...card, maxWidth: 520 }}>
          <div style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>✅</div>
          <p style={{ margin: 0, fontWeight: 700 }}>Connected — {status.whatsappNumber}</p>
          <p style={{ color: "#6b7280", fontSize: "0.9rem", marginTop: "0.4rem" }}>
            {status.onboardingType === "coexistence"
              ? "You kept your WhatsApp Business app — it still works exactly as before, and the ServBazaar bot now also handles bookings on this number alongside you."
              : "Bookings, quotes, and reminders now run through this number automatically."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={pageTitle}>Connect WhatsApp</h1>
      <p style={{ color: "#6b7280", marginTop: "-1rem", marginBottom: "1.5rem", fontSize: "0.9rem", maxWidth: 620 }}>
        Connect your own WhatsApp number so bookings, quotes, and reminders run through the number your customers already message.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>📱 Already using WhatsApp Business?</div>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", margin: 0 }}>
            Keep the app on your phone exactly as it is — nothing gets deregistered, no lost chats or contacts. The bot just starts
            helping alongside you on the same number.
          </p>
        </div>
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>✨ New to WhatsApp Business?</div>
          <p style={{ color: "#6b7280", fontSize: "0.88rem", margin: 0 }}>
            We'll set up a number ready for automated bookings from the start — no app needed.
          </p>
        </div>
      </div>

      <button type="button" style={{ ...btnPrimary, padding: "0.9rem 1.8rem", fontSize: "1rem" }} disabled={!sdkReady || connecting || !config?.metaAppId} onClick={startConnect}>
        {connecting ? "Connecting…" : "Connect WhatsApp"}
      </button>
      {!config?.metaAppId && <p style={{ color: "#b91c1c", fontSize: "0.85rem", marginTop: "0.75rem" }}>WhatsApp connection isn't configured for this environment yet.</p>}
      {error && <p style={{ color: "#b91c1c", fontSize: "0.85rem", marginTop: "0.75rem" }}>{error}</p>}
      <p style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "1.25rem", maxWidth: 560 }}>
        Meta only transfers new conversations going forward through this connection — messages and contacts already in your WhatsApp
        Business app itself aren't imported, since Meta doesn't expose that history to businesses via the API.
      </p>
    </div>
  );
}

// Module-level scratch var: the postMessage listener and the FB.login
// callback both need to see the same value, and React state updates are
// too slow/async for the brief window between them during a single
// Embedded Signup run.
let lastOnboardingType: OnboardingType | undefined;
