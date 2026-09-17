import { canCreateProjects, getSessionUser } from "@/lib/auth";
import { createProject, listProjectsForUser } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  return Response.json({ projects: listProjectsForUser(user.userId) });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!canCreateProjects(user)) return jsonError("A subscription is required to create projects", 403);
  const body = (await request.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim();
  if (!name) return jsonError("Project name is required");
  const project = createProject(user.userId, name);
  return Response.json({ project });
}
