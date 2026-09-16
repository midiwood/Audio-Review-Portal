import { getSessionUser } from "@/lib/auth";
import { archiveProject, getProjectAccess, getProjectById, updateProject } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getProjectAccess(id, user.userId);
  if (!access) return jsonError("Not found", 404);
  const project = getProjectById(id, {
    kind: access.kind,
    composerId: user.userId,
    includeComments: true,
    includeInvite: access.kind === "admin",
  });
  if (!project) return jsonError("Not found", 404);
  return Response.json({ project, access: access.kind });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getProjectAccess(id, user.userId);
  if (access?.kind !== "admin") return jsonError("Not found", 404);
  const body = (await request.json().catch(() => null)) as { name?: string; notes?: string } | null;
  if (body?.name !== undefined && !body.name.trim()) return jsonError("Name is required");
  const project = updateProject(id, { name: body?.name, notes: body?.notes });
  return Response.json({ project });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getProjectAccess(id, user.userId);
  if (access?.kind !== "admin") return jsonError("Not found", 404);
  const project = archiveProject(id);
  if (!project) return jsonError("Project not found", 404);
  return Response.json({ ok: true });
}
