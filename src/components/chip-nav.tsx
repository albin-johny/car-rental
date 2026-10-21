"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

export type Chip = { href: string; label: string; active: boolean };
export type ChipSelect = { label: string; options: Chip[] };

/**
 * Filter chips, contained in the page column. The row scrolls sideways when the chips don't fit, with
 * the scrollbar hidden; the active chip is scrolled into view when it changes. The 1px top padding
 * stops the scroll container from clipping the chips' outline ring.
 */
export function ChipNav({ chips, label, select }: { chips: Chip[]; label: string; select?: ChipSelect }) {
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

  // An optional dropdown sits in the same row, before the chips (e.g. a second filter).
  const selected = select?.options.find((o) => o.active)?.href ?? select?.options[0]?.href;
  const [shownSelected, setShownSelected] = useOptimistic(selected);
  const [open, setOpen] = useState(false);
  const current = select?.options.find((o) => o.href === shownSelected);
  const filtered = !!select && shownSelected !== select.options[0].href;
  const pick = (href: string) => {
    setOpen(false);
    if (href === selected) return;
    startTransition(() => {
      setShownSelected(href);
      router.push(href);
    });
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!(e.target as Element).closest("[data-chip-nav]")) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>("[aria-current=page]");
    if (!box.current || !el) return;
    box.current.scrollTo({ left: el.offsetLeft - (box.current.clientWidth - el.offsetWidth) / 2 });
  }, [activeHref]);

  return (
    <div data-chip-nav data-pending={pending || undefined} className="relative flex items-start gap-2">
    <nav
      ref={box}
      aria-label={label}
      aria-busy={pending}
      className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 pt-px text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
    {select && (
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label={select.label}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`chip ${filtered ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100"}`}
        >
          {current?.label}
        </button>
        {open && (
          <ul role="listbox" aria-label={select.label} className="absolute right-0 top-full z-20 mt-1 min-w-full overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200">
            {select.options.map((o) => (
              <li key={o.label} role="option" aria-selected={o.href === shownSelected}>
                <button type="button" onClick={() => pick(o.href)} className={`block w-full whitespace-nowrap px-4 py-2 text-left hover:bg-slate-50 ${o.href === shownSelected ? "font-semibold text-blue-700" : "text-slate-700"}`}>
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )}
    {pending && <div className="chip-bar pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-full bg-blue-100" role="progressbar" aria-label="Loading"><span /></div>}
    </div>
  );
}
