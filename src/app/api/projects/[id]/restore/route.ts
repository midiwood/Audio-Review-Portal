import { getSessionUser } from "@/lib/auth";
import { projectOwnedBy, restoreProject } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const owned = projectOwnedBy(id, user.userId);
  if (!owned || owned.deletedAt == null) return jsonError("Not found", 404);
  const project = restoreProject(id);
  if (!project) return jsonError("Project not in trash", 404);
  return Response.json({ ok: true, project: { id: project.id, name: project.name } });
}
