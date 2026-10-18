import { env } from "@/lib/env";
import { getUser } from "@/lib/session";
import { deleteInspectionPhoto } from "@/lib/inspections";

// Shown when the image file has been removed by the 1-year retention rule.
const EXPIRED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e2e8f0"/><g fill="none" stroke="#94a3b8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><rect x="150" y="105" width="100" height="76" rx="10"/><circle cx="200" cy="143" r="19"/><path d="M130 205L270 85"/></g><text x="200" y="240" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="#64748b">Photo expired</text></svg>`;

// Private bucket: inspection photos are only ever served through this authenticated route.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const row = await env().DB.prepare("SELECT r2_key FROM inspection_photos WHERE id = ?").bind(id).first<{ r2_key: string }>();
  if (!row) return new Response("Not found", { status: 404 });
  const obj = await env().PHOTOS.get(row.r2_key);
  if (!obj) {
    return new Response(EXPIRED_SVG, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
  }
  return new Response(obj.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const r = await deleteInspectionPhoto((await ctx.params).id, user);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status ?? 400 });
  return new Response(null, { status: 204 });
}
