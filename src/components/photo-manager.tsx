"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/compress-image";
import { PhotoViewer } from "./photo-viewer";

export function PhotoManager({ vehicleId, photos, max, showTitle = true }: { vehicleId: string; photos: { id: string }[]; max: number; showTitle?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      let remaining = max - photos.length;
      for (const file of files) {
        if (remaining-- <= 0) throw new Error(`At most ${max} photos per vehicle`);
        const blob = await compressImage(file);
        const fd = new FormData();
        fd.set("photo", blob, "photo.jpg");
        const res = await fetch(`/api/vehicles/${vehicleId}/photos`, { method: "POST", body: fd });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Upload failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this photo?")) return;
    const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
    if (!res.ok) setError("Could not delete photo");
    router.refresh();
  }

  return (
    <section className="space-y-3">
      {showTitle && <h2 className="font-semibold">Photos ({photos.length}/{max})</h2>}
      <div className="grid grid-cols-2 gap-2">
        {photos.map((p, i) => (
          <div key={p.id} className="relative overflow-hidden rounded-lg bg-slate-200">
            <button type="button" onClick={() => setViewing(i)} aria-label={`Open photo ${i + 1} of ${photos.length}`} className="block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photos/${p.id}`} alt={`Vehicle photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            </button>
            <button
              onClick={() => remove(p.id)}
              aria-label="Delete photo"
              className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      <button className="btn btn-secondary w-full" disabled={busy || photos.length >= max} onClick={() => input.current?.click()}>
        {busy ? "Resizing & uploading…" : "Add photos"}
      </button>
      {error && <p className="err" role="alert">{error}</p>}
      {viewing !== null && (
        <PhotoViewer
          items={photos.map((p, i) => ({ src: `/api/photos/${p.id}`, alt: `Vehicle photo ${i + 1}`, caption: `Photo ${i + 1} of ${photos.length}` }))}
          index={Math.min(viewing, photos.length - 1)}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
