"use client";
import { useEffect } from "react";

// Going back to a list should land where you left it. The page's own back arrow is a normal link (a fresh
// page that opens at the top), so we remember the scroll position per screen and put it back when you return.
const BACK = "fd-back";
const scrollKey = (url: string) => `fd-scroll:${url}`;
export const listKey = (url: string) => `fd-list:${url}`;
const here = () => location.pathname + location.search;

const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* private mode: just no restore */ } };

/** True once if the screen was reached by going back (arrow, swipe or browser back). */
function takeBack(): boolean {
  const t = Number(read(BACK));
  try { sessionStorage.removeItem(BACK); } catch { /* ignore */ }
  return Date.now() - t < 5000;
}

/** Mounted once in the root layout: notices a back move before the previous screen is rebuilt. */
export function BackTracker() {
  useEffect(() => {
    const mark = () => write(BACK, String(Date.now()));
    const onClick = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.('a[aria-label="Go back"]')) mark(); };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", mark);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("popstate", mark); };
  }, []);
  return null;
}

/** Puts the saved position back. Next scrolls new screens to the top as they appear, so we keep trying briefly (or until you scroll). */
function restoreScroll(y: number) {
  let done = false;
  const stop = () => { done = true; window.removeEventListener("touchstart", stop); window.removeEventListener("wheel", stop); };
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("wheel", stop, { passive: true });
  const started = Date.now();
  const tick = () => {
    if (done) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= y - 2) window.scrollTo({ top: y, behavior: "instant" });
    if (Date.now() - started < 1200) setTimeout(tick, 60);
    else stop();
  };
  requestAnimationFrame(tick);
}

/**
 * Place on a list screen. Saves the scroll position as you move; when you come back, restores it.
 * `onBack` lets a client list first put back what it had loaded (e.g. extra "Show more" pages).
 */
export function ScrollRestore({ onBack }: { onBack?: () => void }) {
  useEffect(() => {
    const key = scrollKey(here());
    if (takeBack()) {
      onBack?.();
      const y = Number(read(key));
      if (y > 0) restoreScroll(y);
    }
    let raf = 0;
    const save = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => write(key, String(Math.round(window.scrollY)))); };
    window.addEventListener("scroll", save, { passive: true });
    return () => { window.removeEventListener("scroll", save); cancelAnimationFrame(raf); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export { read as readSession, write as writeSession };
