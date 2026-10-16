"use client";
import { useEffect, useRef } from "react";

export type ViewerItem = { src: string; alt: string; caption?: string };

/** Full-screen in-app photo viewer: swipe or use the arrows to flip through, ✕ / Esc / tap outside to close. */
export function PhotoViewer({ items, index, onIndex, onClose }: { items: ViewerItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const touchX = useRef<number | null>(null);
  const count = items.length;
  const item = items[index];

  const go = (delta: number) => onIndex((index + delta + count) % count);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && count > 1) onIndex((index - 1 + count) % count);
      else if (e.key === "ArrowRight" && count > 1) onIndex((index + 1) % count);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // stop the page scrolling behind the viewer
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, count, onIndex, onClose]);

  // Warm the neighbours so swiping feels instant.
  useEffect(() => {
    for (const d of [-1, 1]) {
      const n = items[(index + d + count) % count];
      if (n) new Image().src = n.src;
    }
  }, [index, items, count]);

  if (!item) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-between px-3 py-2 text-white">
        <span className="text-sm tabular-nums">{index + 1} / {count}</span>
        <button type="button" aria-label="Close photo viewer" onClick={onClose} className="flex h-12 w-12 items-center justify-center rounded-full text-2xl active:bg-white/20">✕</button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current === null || count < 2) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={item.src} src={item.src} alt={item.alt} className="max-h-full max-w-full select-none object-contain" draggable={false} />
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-3xl text-white active:bg-white/30">‹</button>
            <button type="button" aria-label="Next photo" onClick={() => go(1)} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-3xl text-white active:bg-white/30">›</button>
          </>
        )}
      </div>

      <p className="min-h-10 px-4 py-2 text-center text-sm text-white/80">{item.caption ?? item.alt}</p>
    </div>
  );
}
