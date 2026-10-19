"use client";
import { useEffect, useState } from "react";

/**
 * Launch screen for the installed app. iPhones only honour the splash images from some install routes (not reliably
 * when added from Chrome), so the app draws its own: the icon on the app background, shown while a freshly opened
 * app loads, then faded out. It only appears in the installed (standalone) app, never in a normal browser tab.
 * Server-rendered (visible before any script runs) and hidden by the CSS in globals.css unless standalone.
 */
export function LaunchScreen() {
  const [gone, setGone] = useState(false);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 250);
    const t2 = setTimeout(() => setGone(true), 550);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (gone) return null;
  return (
    <div className={`launch-screen ${fading ? "launch-screen-out" : ""}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={120} height={120} className="h-28 w-28 rounded-[26px] shadow-lg" />
    </div>
  );
}
