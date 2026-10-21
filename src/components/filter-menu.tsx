"use client";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import type { Chip } from "./chip-nav";

/** A small chip-style dropdown (no arrow or ticks) that navigates when an option is picked. The first option is the "no filter" one. */
export function FilterMenu({ label, options }: { label: string; options: Chip[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const selected = options.find((o) => o.active)?.href ?? options[0].href;
  const [shown, setShown] = useOptimistic(selected);
  const [open, setOpen] = useState(false);
  const filtered = shown !== options[0].href;

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!(e.target as Element).closest("[data-filter-menu]")) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const pick = (href: string) => {
    setOpen(false);
    if (href === selected) return;
    startTransition(() => {
      setShown(href);
      router.push(href);
    });
  };

  return (
    <div data-filter-menu className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`chip ${filtered ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 active:bg-slate-100"}`}
      >
        {options.find((o) => o.href === shown)?.label}
      </button>
      {open && (
        <ul role="listbox" aria-label={label} className="absolute right-0 top-full z-20 mt-1 min-w-full overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-slate-200">
          {options.map((o) => (
            <li key={o.label} role="option" aria-selected={o.href === shown}>
              <button type="button" onClick={() => pick(o.href)} className={`block w-full whitespace-nowrap px-4 py-2 text-left hover:bg-slate-50 ${o.href === shown ? "font-semibold text-blue-700" : "text-slate-700"}`}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
