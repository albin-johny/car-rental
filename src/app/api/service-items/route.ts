import { getUser } from "@/lib/session";
import { suggestServiceItems } from "@/lib/service";

export async function GET(req: Request) {
  if (!(await getUser())) return Response.json({ error: "Not signed in" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return Response.json(await suggestServiceItems(q.slice(0, 60)));
}
