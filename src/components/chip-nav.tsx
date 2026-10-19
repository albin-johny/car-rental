"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useTransition } from "react";

export type Chip = { href: string; label: string; active: boolean };

/**
 * Filter chips, contained in the page column. The row scrolls sideways when the chips don't fit, with
 * the scrollbar hidden; the active chip is scrolled into view when it changes. The 1px top padding
 * stops the scroll container from clipping the chips' outline ring.
 */
export function ChipNav({ chips, label }: { chips: Chip[]; label: string }) {
  const box = useRef<HTMLElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const activeHref = chips.find((c) => c.active)?.href;
  // The tapped chip lights up at once; the list below dims and a thin bar runs until the new data arrives.
  const [shownHref, setShownHref] = useOptimistic(activeHref);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (href === activeHref) return;
    startTransition(() => {
      setShownHref(href);
      router.push(href);
    });
  };

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>("[aria-current=page]");
    if (!box.current || !el) return;
    box.current.scrollTo({ left: el.offsetLeft - (box.current.clientWidth - el.offsetWidth) / 2 });
  }, [activeHref]);

  return (
    <div data-chip-nav data-pending={pending || undefined} className="relative">
    <nav
      ref={box}
      aria-label={label}
      aria-busy={pending}
      className="relative flex gap-2 overflow-x-auto pb-1 pt-px text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {chips.map((c) => {
        const on = c.href === shownHref;
        return (
        <Link
          key={c.label}
          href={c.href}
          onClick={(e) => go(e, c.href)}
          aria-current={on ? "page" : undefined}
          className={`chip ${on ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100"}`}
        >
          {c.label}
        </Link>
        );
      })}
    </nav>
    {pending && <div className="chip-bar pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full bg-blue-100" role="progressbar" aria-label="Loading"><span /></div>}
    </div>
  );
}
