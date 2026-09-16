import { getSessionUser } from "@/lib/auth";
import { purgeArchivedProjectsForOwner } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { removeStoredAudio } from "@/lib/playback";
import { deleteSpacesTrackPrefix } from "@/lib/spaces";

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (user.role !== "admin") return jsonError("Not found", 404);

  const { projectIds, trackIds, files } = purgeArchivedProjectsForOwner(user.userId);
  for (const filename of files) await removeStoredAudio(filename);
  for (const trackId of trackIds) await deleteSpacesTrackPrefix(trackId);
  return Response.json({ ok: true, purged: projectIds.length });
}
