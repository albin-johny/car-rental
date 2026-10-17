import { getUser } from "@/lib/session";
import { addDocFile } from "@/lib/vehicle-docs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file provided" }, { status: 400 });
  const r = await addDocFile((await ctx.params).id, await file.arrayBuffer(), user);
  if ("error" in r) return Response.json({ error: r.error }, { status: r.status ?? 400 });
  return Response.json({ id: r.id }, { status: 201 });
}
