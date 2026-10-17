"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";

export type Chip = { href: string; label: string; active: boolean };

/**
 * Filter chips, contained in the page column. The row scrolls sideways when the chips don't fit, with
 * the scrollbar hidden; the active chip is scrolled into view when it changes. The 1px top padding
 * stops the scroll container from clipping the chips' outline ring.
 */
export function ChipNav({ chips, label }: { chips: Chip[]; label: string }) {
  const box = useRef<HTMLElement>(null);
  const activeHref = chips.find((c) => c.active)?.href;

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>("[aria-current=page]");
    if (!box.current || !el) return;
    box.current.scrollTo({ left: el.offsetLeft - (box.current.clientWidth - el.offsetWidth) / 2 });
  }, [activeHref]);

  return (
    <nav
      ref={box}
      aria-label={label}
      className="relative flex gap-2 overflow-x-auto pb-1 pt-px text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {chips.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          aria-current={c.active ? "page" : undefined}
          className={`chip ${c.active ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100"}`}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  );
}
