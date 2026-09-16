import { getSessionUser } from "@/lib/auth";
import { createProject, listProjectsForUser } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  return Response.json({ projects: listProjectsForUser(user.userId, user.role) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (user.role !== "admin") return jsonError("Only admin can create projects", 403);
  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return jsonError("Project name is required");
  const project = createProject(user.userId, name);
  return Response.json({ project });
}
