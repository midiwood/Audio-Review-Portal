import { getSessionUser } from "@/lib/auth";
import { canOwnTrack, restoreTrack } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  if (!canOwnTrack(user.userId, id, { includeArchived: true })) {
    return jsonError("Only the track owner can restore this track", 403);
  }
  const track = restoreTrack(id);
  if (!track) return jsonError("Track not in trash", 404);
  return Response.json({ ok: true, track: { id: track.id, title: track.title } });
}
