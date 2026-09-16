import { getSessionUser } from "@/lib/auth";
import {
  canWriteTrack,
  countTrackVersions,
  deleteVersion,
  getProjectAccess,
  getVersionAccess,
  isTrackSharedWithStudio,
  updateVersion,
} from "@/lib/data";
import { jsonError } from "@/lib/http";
import { notifyStatusChange } from "@/lib/notify";
import { removeStoredAudio } from "@/lib/playback";
import { isVersionStatus } from "@/lib/status";

export async function PATCH(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const access = getVersionAccess(versionId);
  if (!access) return jsonError("Not found", 404);

  const body = (await request.json().catch(() => null)) as {
    status?: string;
    durationSeconds?: number;
    token?: string;
  } | null;

  const user = await getSessionUser();
  const projectAccess = user ? getProjectAccess(access.project.id, user.userId) : null;
  const shared = isTrackSharedWithStudio(access.track, access.project);
  const isAdmin = projectAccess?.kind === "admin" && shared;
  const isComposer = projectAccess?.kind === "composer" && access.track.composerId === user?.userId;
  const isShare = body?.token === access.project.shareToken && shared;

  if (body?.status !== undefined) {
    if (!isAdmin) return jsonError("Unauthorized", 401);
    if (!isVersionStatus(body.status)) return jsonError("Invalid status");
    const version = updateVersion(versionId, { status: body.status });
    if (user) {
      await notifyStatusChange({
        projectId: access.project.id,
        projectName: access.project.name,
        trackId: access.track.id,
        trackTitle: access.track.title,
        composerId: access.track.composerId,
        versionId,
        status: body.status,
        actorUserId: user.userId,
      });
    }
    return Response.json({ version });
  }

  if (typeof body?.durationSeconds === "number") {
    if (!isAdmin && !isComposer && !isShare) return jsonError("Unauthorized", 401);
    const version = updateVersion(versionId, { durationSeconds: body.durationSeconds });
    return Response.json({ version });
  }

  return jsonError("Nothing to update");
}

export async function DELETE(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { versionId } = await context.params;
  const access = getVersionAccess(versionId);
  if (!access) return jsonError("Not found", 404);
  if (!canWriteTrack(user.userId, access.track.id)) {
    return jsonError("Only the track owner can delete a version", 403);
  }
  if (countTrackVersions(access.track.id) < 2) {
    return jsonError("Delete the track to remove the last version");
  }
  const storedFilename = deleteVersion(versionId);
  if (storedFilename) await removeStoredAudio(storedFilename);
  return Response.json({ ok: true });
}
