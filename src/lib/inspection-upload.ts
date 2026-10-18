import { compressImage, makeThumb } from "./compress-image";

/** Client-side: shrink each photo on the phone, then upload them one by one. Throws a readable message on failure. */
export async function uploadInspectionPhotos(
  inspectionId: string, files: File[], room: number, onProgress: (text: string) => void,
) {
  for (const [i, file] of files.entries()) {
    if (room-- <= 0) throw new Error("No room for more photos");
    onProgress(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…");
    const blob = await compressImage(file);
    const fd = new FormData();
    fd.set("photo", blob, "photo.jpg");
    const thumb = await makeThumb(file);
    if (thumb) fd.set("thumb", thumb, "thumb.jpg");
    const res = await fetch(`/api/inspections/${inspectionId}/photos`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Upload failed, try again");
  }
}
