import { getSessionUser } from "@/lib/auth";
import {
  canManageTrackMedia,
  createTrack,
  createVersion,
  getProjectAccess,
  getTrack,
  isTrackApproved,
} from "@/lib/data";
import { titleFromFilename } from "@/lib/format";
import { jsonError } from "@/lib/http";
import { markPlaybackReady, playbackSidecarName } from "@/lib/playback";
import { isSafeStoredKey, isSpacesConfigured, spacesObjectExists } from "@/lib/spaces";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!isSpacesConfigured()) return jsonError("DigitalOcean Spaces is not configured", 400);

  const body = (await request.json().catch(() => null)) as {
    projectId?: string;
    trackId?: string;
    title?: string;
    originalFilename?: string;
    mimeType?: string;
    storedFilename?: string;
    playbackKey?: string;
  } | null;

  const projectId = body?.projectId?.trim() ?? "";
  const originalFilename = body?.originalFilename?.trim() ?? "";
  const storedFilename = body?.storedFilename?.trim() ?? "";
  const mimeType = body?.mimeType?.trim() || "application/octet-stream";
  if (!projectId || !originalFilename || !storedFilename) return jsonError("Upload metadata is required");
  if (!isSafeStoredKey(storedFilename)) return jsonError("Invalid storage key");

  const access = getProjectAccess(projectId, user.userId);
  if (!access) return jsonError("Not found", 404);

  let trackId = body?.trackId?.trim() ?? "";
  if (trackId) {
    const write = canManageTrackMedia(user.userId, trackId);
    if (!write || write.project.id !== projectId) {
      return jsonError("Only the track owner can add versions", 403);
    }
    if (isTrackApproved(trackId)) {
      return jsonError("This track is approved. Upload finals and stems instead.", 403);
    }
  } else {
    // Prefer creating the track at /api/storage/sign so Spaces keys use tracks/{id}/…
    const composerId = access.kind === "admin" ? access.project.ownerId : user.userId;
    if (access.kind !== "admin" && access.kind !== "composer") {
      return jsonError("Not allowed to add tracks", 403);
    }
    trackId = createTrack(
      projectId,
      body?.title?.trim() || titleFromFilename(originalFilename),
      composerId,
    ).id;
  }

  if (!(await spacesObjectExists(storedFilename))) {
    return jsonError("Uploaded file was not found in Spaces", 400);
  }

  const playbackKey = body?.playbackKey?.trim() ?? "";
  if (playbackKey) {
    if (playbackKey !== playbackSidecarName(storedFilename) || !isSafeStoredKey(playbackKey)) {
      return jsonError("Invalid playback key");
    }
    if (!(await spacesObjectExists(playbackKey))) {
      return jsonError("Playback file was not found in Spaces", 400);
    }
    markPlaybackReady(storedFilename);
  }

  // Always live in review on upload (no draft step).
  const version = createVersion({
    trackId,
    originalFilename,
    storedFilename,
    mimeType,
    status: "review_requested",
    unreadForAdmin: access.kind !== "admin",
  });

  if (access.kind !== "admin") {
    const track = getTrack(trackId);
    if (track) {
      const { notifyUpload } = await import("@/lib/notify");
      await notifyUpload({
        projectId,
        projectName: access.project.name,
        ownerId: access.project.ownerId,
        actorUserId: user.userId,
        trackId,
        trackTitle: track.title,
        versionId: version.id,
        versionNumber: version.versionNumber,
        isNewTrack: version.versionNumber <= 1,
      });
    }
  }

  return Response.json({ version, trackId });
}
