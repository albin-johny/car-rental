import { env } from "@/lib/env";
import { getUser } from "@/lib/session";
import { MAX_PHOTOS, MAX_PHOTO_BYTES, getVehicle } from "@/lib/vehicles";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return json({ error: "Not signed in" }, 401);
  const { id } = await ctx.params;
  const { DB, PHOTOS } = env();

  const vehicle = await getVehicle(id);
  if (!vehicle) return json({ error: "Vehicle not found" }, 404);

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return json({ error: "No photo provided" }, 400);
  if (file.size === 0 || file.size > MAX_PHOTO_BYTES) {
    return json({ error: `Photo must be under ${MAX_PHOTO_BYTES / 1024} KB` }, 413);
  }
  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes, 0, 3);
  if (!(head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)) {
    return json({ error: "Only JPEG photos are accepted" }, 415);
  }

  const count = await DB.prepare("SELECT COUNT(*) AS n FROM vehicle_photos WHERE vehicle_id = ?").bind(id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PHOTOS) return json({ error: `At most ${MAX_PHOTOS} photos per vehicle` }, 409);

  const photoId = crypto.randomUUID();
  const key = `vehicles/${id}/${photoId}.jpg`;
  await PHOTOS.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  try {
    await DB.prepare("INSERT INTO vehicle_photos (id,vehicle_id,r2_key,content_type,size_bytes,created_at) VALUES (?,?,?,?,?,?)")
      .bind(photoId, id, key, "image/jpeg", bytes.byteLength, new Date().toISOString())
      .run();
  } catch (e) {
    await PHOTOS.delete(key); // don't leave an orphan object
    throw e;
  }
  return json({ id: photoId }, 201);
}
