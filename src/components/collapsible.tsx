"use client";
import { useId, useState } from "react";

/** A card that shows a one-line summary and opens on tap. The children are only mounted while open. */
export function Collapsible({ title, summary, children, defaultOpen = false }: { title: string; summary?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="card overflow-hidden">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50">
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          {summary && <span className="mt-0.5 block truncate text-sm text-slate-500">{summary}</span>}
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
        </span>
      </button>
      {open && <div id={id} className="space-y-6 border-t border-slate-100 p-4">{children}</div>}
    </section>
  );
}
