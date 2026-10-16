// Runs on the phone: downscale + re-encode as JPEG until it is <= ~300 KB.
const TARGET_BYTES = 300 * 1024;
const MAX_SIDE = 1600;

function toBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
}

export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) throw new Error("This image format is not supported");
  let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not process image");
      ctx.fillStyle = "#fff"; // JPEG has no alpha
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        const blob = await toBlob(canvas, q);
        if (blob && blob.size <= TARGET_BYTES) return blob;
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Could not shrink this photo enough");
}
