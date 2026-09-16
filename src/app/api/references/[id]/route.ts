import { getSessionUser } from "@/lib/auth";
import { canManageTrackMedia, deleteReference, getReference } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const row = getReference(id);
  if (!row) return jsonError("Not found", 404);
  if (!canManageTrackMedia(user.userId, row.trackId)) {
    return jsonError("Only the track owner can remove Apple Music references", 403);
  }
  deleteReference(id);
  return Response.json({ ok: true });
}
