// Small copies (~360px, ~20 KB) of photos, made on the phone at upload so lists and grids load fast.
// Stored next to the photo as "<key>-t.jpg" (so the inspections/ retention rule covers them too). Older photos
// have none; the photo routes then serve the full image, so nothing breaks.
export const MAX_THUMB_BYTES = 60 * 1024;
export const thumbKey = (key: string) => key.replace(/\.jpg$/, "-t.jpg");

/** Best-effort: a missing or invalid thumbnail never blocks the real upload. */
export async function putThumb(bucket: R2Bucket, key: string, thumb: unknown) {
  if (!(thumb instanceof File) || thumb.size === 0 || thumb.size > MAX_THUMB_BYTES) return;
  const bytes = await thumb.arrayBuffer();
  const h = new Uint8Array(bytes, 0, 3);
  if (!(h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff)) return;
  await bucket.put(thumbKey(key), bytes, { httpMetadata: { contentType: "image/jpeg" } }).catch(() => {});
}

export const deleteThumb = (bucket: R2Bucket, key: string) => bucket.delete(thumbKey(key)).catch(() => {});
