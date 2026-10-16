"use client";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallButton() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return <p className="text-sm text-green-700">✓ Installed on this device</p>;
  if (evt) {
    return (
      <button
        className="btn w-full"
        onClick={async () => {
          await evt.prompt();
          await evt.userChoice;
          setEvt(null);
        }}
      >
        Add to Home Screen
      </button>
    );
  }
  return (
    <div className="space-y-1 text-sm text-slate-600">
      <p className="font-medium text-slate-800">Add to Home Screen</p>
      {ios ? (
        <p>Tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</p>
      ) : (
        <p>Open the browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
      )}
    </div>
  );
}
