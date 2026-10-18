"use client";
import { useRef, useState } from "react";
import { useConfirm } from "./confirm-sheet";
import { useRouter } from "next/navigation";
import { MAX_INSPECTION_PHOTOS } from "@/lib/inspection-constants";
import { uploadInspectionPhotos } from "@/lib/inspection-upload";

/** Admin-only: add photos to an inspection that was completed without any. */
export function LatePhotoUploader({ inspectionId, count }: { inspectionId: string; count: number }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const busy = progress !== "";
  const full = count >= MAX_INSPECTION_PHOTOS;

  async function go(files: File[]) {
    if (!files.length) return;
    setError("");
    try {
      await uploadInspectionPhotos(inspectionId, files, MAX_INSPECTION_PHOTOS - count, setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed, try again");
    } finally {
      setProgress("");
      router.refresh();
    }
  }
  return (
    <div className="space-y-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void go(f); }} />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void go(f); }} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn" disabled={busy || full} onClick={() => camera.current?.click()}>📷 Take photo</button>
        <button type="button" className="btn btn-secondary" disabled={busy || full} onClick={() => gallery.current?.click()}>From gallery</button>
      </div>
      {busy && <p className="text-sm text-slate-600" role="status">{progress}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  );
}

export function DeleteLatePhotoButton({ photoId, label }: { photoId: string; label: string }) {
  const router = useRouter();
  const ask = useConfirm();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        if (!(await ask("Delete this photo?", { confirmLabel: "Delete", danger: true }))) return;
        const res = await fetch(`/api/inspection-photos/${photoId}`, { method: "DELETE" });
        if (!res.ok) alert("Could not delete the photo");
        router.refresh();
      }}
      className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
    >
      ✕
    </button>
  );
}
