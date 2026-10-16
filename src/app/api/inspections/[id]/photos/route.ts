import { getUser } from "@/lib/session";
import { addInspectionPhoto, reorderInspectionPhotos } from "@/lib/inspections";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return Response.json({ error: "No photo provided" }, { status: 400 });
  const r = await addInspectionPhoto(id, await file.arrayBuffer(), user);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status ?? 400 });
  return Response.json({ id: r.id }, { status: 201 });
}

// Body: { order: [photoId, ...] }, the full list in the order staff chose.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getUser())) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { order?: unknown } | null;
  if (!body || !Array.isArray(body.order) || !body.order.every((x) => typeof x === "string")) {
    return Response.json({ error: "Invalid order" }, { status: 400 });
  }
  const r = await reorderInspectionPhotos(id, body.order as string[]);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status ?? 400 });
  return new Response(null, { status: 204 });
}
