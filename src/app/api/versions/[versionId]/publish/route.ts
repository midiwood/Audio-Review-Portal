import { getSessionUser } from "@/lib/auth";
import { canManageTrackMedia, countTrackVersions, getVersion, publishVersion } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { notifyUpload } from "@/lib/notify";

export async function POST(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { versionId } = await context.params;

  const existing = getVersion(versionId);
  if (!existing) return jsonError("Not found", 404);
  if (existing.status !== "in_progress") {
    return jsonError("Only draft versions can be published", 400);
  }

  const access = canManageTrackMedia(user.userId, existing.trackId);
  if (!access) return jsonError("Only the track owner can publish this version", 403);

  const version = publishVersion(versionId);
  if (!version) return jsonError("Could not publish version", 400);

  const isNewTrack = countTrackVersions(access.track.id) <= 1;
  await notifyUpload({
    projectId: access.project.id,
    projectName: access.project.name,
    ownerId: access.project.ownerId,
    actorUserId: user.userId,
    trackId: access.track.id,
    trackTitle: access.track.title,
    versionId: version.id,
    versionNumber: version.versionNumber,
    isNewTrack,
  });

  return Response.json({ version });
}
