import { getSessionUser } from "@/lib/auth";
import { listTrackIdsForProject, projectOwnedBy, purgeProject } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { removeStoredAudio } from "@/lib/playback";
import { deleteSpacesTrackPrefix } from "@/lib/spaces";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const owned = projectOwnedBy(id, user.userId);
  if (!owned || owned.deletedAt == null) return jsonError("Not found", 404);
  const trackIds = listTrackIdsForProject(id);
  const files = purgeProject(id);
  if (!files) return jsonError("Project not in trash", 404);
  for (const filename of files) await removeStoredAudio(filename);
  for (const trackId of trackIds) await deleteSpacesTrackPrefix(trackId);
  return Response.json({ ok: true });
}
