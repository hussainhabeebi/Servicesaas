import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "servbazaar_install_dismissed";

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Chrome/Edge/Android fire beforeinstallprompt when the PWA install
 * criteria (manifest + service worker + icons) are met; we stash that
 * event and surface our own "Install app" banner instead of relying on
 * the browser's address-bar icon, which most users never notice.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === "1");

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred || dismissed || isStandalone()) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.6rem 1rem",
        background: "#036f71",
        color: "#fff",
        fontSize: "0.85rem",
      }}
    >
      <img src="/favicon-32x32.png" alt="" width={20} height={20} style={{ borderRadius: 5, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>Install ServBazaar on this device for one-tap access.</span>
      <button
        onClick={install}
        style={{
          background: "#d2ad3a",
          color: "#1a1400",
          border: "none",
          borderRadius: 6,
          padding: "0.35rem 0.8rem",
          fontWeight: 700,
          fontSize: "0.8rem",
          cursor: "pointer",
        }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "1rem", opacity: 0.8, padding: "0 0.2rem" }}
      >
        ×
      </button>
    </div>
  );
}
