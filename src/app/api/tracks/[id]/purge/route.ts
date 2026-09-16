import { getSessionUser } from "@/lib/auth";
import { canOwnTrack, purgeTrack } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { removeStoredAudio } from "@/lib/playback";
import { deleteSpacesTrackPrefix } from "@/lib/spaces";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  if (!canOwnTrack(user.userId, id, { includeArchived: true })) {
    return jsonError("Only the track owner can delete this track", 403);
  }
  const files = purgeTrack(id);
  if (!files) return jsonError("Track not in trash", 404);
  for (const filename of files) await removeStoredAudio(filename);
  await deleteSpacesTrackPrefix(id);
  return Response.json({ ok: true });
}
