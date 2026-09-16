import { getSessionUser } from "@/lib/auth";
import {
  addProjectMember,
  findComposerById,
  getProjectAccess,
  listInviteableComposers,
  removeProjectMember,
} from "@/lib/data";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getProjectAccess(id, user.userId);
  if (access?.kind !== "admin") return jsonError("Not found", 404);
  return Response.json({ composers: listInviteableComposers(id) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getProjectAccess(id, user.userId);
  if (access?.kind !== "admin") return jsonError("Not found", 404);

  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) return jsonError("Composer is required");

  const composer = findComposerById(userId);
  if (!composer) return jsonError("That user is not a composer", 404);
  if (composer.id === access.project.ownerId) return jsonError("The studio owner is already on this project");

  addProjectMember(id, composer.id);
  return Response.json({ ok: true, composers: listInviteableComposers(id) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getProjectAccess(id, user.userId);
  if (access?.kind !== "admin") return jsonError("Not found", 404);

  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) return jsonError("Composer is required");
  if (userId === access.project.ownerId) return jsonError("The studio owner cannot be removed");

  const composer = findComposerById(userId);
  if (!composer) return jsonError("That user is not a composer", 404);

  removeProjectMember(id, composer.id);
  return Response.json({ ok: true, composers: listInviteableComposers(id) });
}
