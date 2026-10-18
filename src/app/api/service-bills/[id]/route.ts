import { env } from "@/lib/env";
import { getUser } from "@/lib/session";
import { deleteServiceBill, getServiceBill } from "@/lib/service";

// Private bucket: bills are only ever served through this signed-in route.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const row = await getServiceBill((await ctx.params).id);
  if (!row) return new Response("Not found", { status: 404 });
  const obj = await env().PHOTOS.get(row.r2_key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const r = await deleteServiceBill((await ctx.params).id, user);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status ?? 400 });
  return new Response(null, { status: 204 });
}
