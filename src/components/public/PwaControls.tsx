"use client";

import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaControls() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => console.warn("Newsfeed offline support is unavailable in this browser."));
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return (
    <details className="pwa-install">
      <summary>Install app</summary>
      <div className="install-instructions">
        {installEvent && (
          <button className="glass-pill" onClick={install}>
            Install Bihar News
          </button>
        )}
        <p>
          On Android or desktop, open your browser menu and choose Install app or Add to home
          screen.
        </p>
        <p>On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen.</p>
      </div>
    </details>
  );
}
