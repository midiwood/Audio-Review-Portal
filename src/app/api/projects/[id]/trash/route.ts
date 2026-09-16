import { getSessionUser } from "@/lib/auth";
import { getProjectAccess, purgeArchivedTracksForProject } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { removeStoredAudio } from "@/lib/playback";
import { deleteSpacesTrackPrefix } from "@/lib/spaces";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  if (!getProjectAccess(id, user.userId)) return jsonError("Not found", 404);

  const { trackIds, files } = purgeArchivedTracksForProject(id, user.userId);
  for (const filename of files) await removeStoredAudio(filename);
  for (const trackId of trackIds) await deleteSpacesTrackPrefix(trackId);
  return Response.json({ ok: true, purged: trackIds.length });
}
