"use client";
import { useState } from "react";
import { PhotoViewer } from "./photo-viewer";
import { DeleteLatePhotoButton } from "./late-photo-tools";

export type Thumb = { id: string; src: string; alt: string; caption?: string; late?: boolean; lateNote?: string };

/** Read-only thumbnails that open the in-app viewer. `full` = inspection page, `compact` = side-by-side cells. */
export function ThumbGrid({ items, variant = "full", adminDeleteLate = false }: { items: Thumb[]; variant?: "full" | "compact"; adminDeleteLate?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const compact = variant === "compact";
  return (
    <>
      <ol className={compact ? "grid grid-cols-2 gap-1" : "grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"}>
        {items.map((t, i) => (
          <li key={t.id}>
            <div className="relative">
              <button type="button" onClick={() => setOpen(i)} aria-label={`Open photo ${i + 1} of ${items.length}`} className={`block w-full overflow-hidden bg-slate-200 ${compact ? "h-16 rounded-md" : "rounded-lg"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.src} alt={t.alt} className={`w-full object-cover ${compact ? "h-full" : "aspect-[4/3]"}`} loading="lazy" decoding="async" />
              </button>
              <span className={`absolute flex items-center justify-center rounded-full font-semibold text-white shadow ${t.late ? "bg-amber-600" : "bg-blue-600"} ${compact ? "left-0.5 top-0.5 px-1.5 text-[10px]" : "left-1.5 top-1.5 h-7 min-w-7 px-2 text-sm"}`} title={t.late ? "Added later" : undefined}>{i + 1}</span>
              {!compact && t.late && adminDeleteLate && <DeleteLatePhotoButton photoId={t.id} label={`Delete photo ${i + 1}`} />}
            </div>
            {!compact && t.lateNote && <p className="mt-1 text-xs text-amber-700">{t.lateNote}</p>}
          </li>
        ))}
      </ol>
      {open !== null && (
        <PhotoViewer items={items.map((t) => ({ src: t.src, alt: t.alt, caption: t.caption ?? t.alt }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
