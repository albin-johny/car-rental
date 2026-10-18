"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const TRIGGER = 70; // px of pull needed
const MAX = 110;

/** Pull down at the top of any screen to reload its data, like a native list. Touch screens only. */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [pending, start] = useTransition();
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const set = (n: number) => { pullRef.current = n; setPull(n); };
    const onStart = (e: TouchEvent) => {
      const t = e.target as Element | null;
      // only from the very top of the page, one finger, and never inside the photo viewer or dialogs
      if (window.scrollY > 0 || e.touches.length !== 1 || t?.closest("[role=dialog]")) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) { if (pullRef.current) set(0); return; }
      set(Math.min(MAX, dy * 0.5));
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (pullRef.current >= TRIGGER / 2) start(() => router.refresh());
      set(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const shown = pending ? TRIGGER / 2 : pull;
  if (shown <= 0) return null;
  const ready = pull >= TRIGGER / 2;
  return (
    <div aria-hidden={!pending} role={pending ? "status" : undefined} className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center" style={{ transform: `translateY(calc(env(safe-area-inset-top) + ${shown - 8}px))`, transition: pull ? "none" : "transform 150ms" }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-slate-200">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round" className={pending ? "animate-spin" : ""} style={pending ? undefined : { transform: `rotate(${ready ? 180 : pull * 3}deg)`, opacity: Math.min(1, pull / 30) }}>
          <path d="M12 4v12M6 12l6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}
