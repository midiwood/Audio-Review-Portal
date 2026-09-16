import { getSessionUser } from "@/lib/auth";
import { archiveTrack, canOwnTrack, canWriteTrack, updateTrackTitle } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  if (!canWriteTrack(user.userId, id)) {
    return jsonError("Only the track owner can edit this track", 403);
  }
  const body = (await request.json().catch(() => null)) as { title?: string } | null;
  const title = body?.title?.trim();
  if (!title) return jsonError("Title is required");
  const track = updateTrackTitle(id, title);
  return Response.json({ track });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  if (!canOwnTrack(user.userId, id)) {
    return jsonError("Only the track owner can delete this track", 403);
  }
  const track = archiveTrack(id);
  if (!track) return jsonError("Track not found", 404);
  return Response.json({ ok: true });
}
