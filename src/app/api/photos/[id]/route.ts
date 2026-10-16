import { env } from "@/lib/env";
import { getUser } from "@/lib/session";

type Row = { r2_key: string; content_type: string };
const find = (id: string) =>
  env().DB.prepare("SELECT r2_key, content_type FROM vehicle_photos WHERE id = ?").bind(id).first<Row>();

// The bucket is private; photos are only ever served through this authenticated route.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const row = await find((await ctx.params).id);
  if (!row) return new Response("Not found", { status: 404 });
  const obj = await env().PHOTOS.get(row.r2_key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.content_type,
      "Cache-Control": "private, max-age=86400, immutable", // ids are never reused
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const id = (await ctx.params).id;
  const row = await find(id);
  if (!row) return new Response("Not found", { status: 404 });
  await env().DB.prepare("DELETE FROM vehicle_photos WHERE id = ?").bind(id).run();
  await env().PHOTOS.delete(row.r2_key);
  return new Response(null, { status: 204 });
}
