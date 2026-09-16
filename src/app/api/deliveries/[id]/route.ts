import { getSessionUser } from "@/lib/auth";
import { canAccessDeliveries, canManageTrackMedia, deleteDelivery, getDeliveryAccess } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { removeStoredAudio } from "@/lib/playback";
import { redirectOrStreamStoredFile } from "@/lib/stored-audio";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getDeliveryAccess(id);
  if (!access || !canAccessDeliveries(user.userId, access.track.id)) return jsonError("Not found", 404);

  try {
    return await redirectOrStreamStoredFile({
      storedFilename: access.delivery.storedFilename,
      mimeType: access.delivery.mimeType,
      original: true,
      downloadName: access.delivery.originalFilename,
    });
  } catch {
    return jsonError("Could not read file", 500);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getDeliveryAccess(id);
  if (!access) return jsonError("Not found", 404);
  if (!canManageTrackMedia(user.userId, access.track.id)) {
    return jsonError("Only the track owner can remove finals and stems", 403);
  }
  const storedFilename = deleteDelivery(id);
  if (storedFilename) await removeStoredAudio(storedFilename);
  return Response.json({ ok: true });
}
