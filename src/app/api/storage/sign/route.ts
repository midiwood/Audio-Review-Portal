import { getSessionUser } from "@/lib/auth";
import {
  canManageTrackMedia,
  createTrack,
  getProjectAccess,
  getVersionAccess,
  isTrackApproved,
  isTrackSharedWithStudio,
} from "@/lib/data";
import { titleFromFilename } from "@/lib/format";
import { jsonError } from "@/lib/http";
import { playbackSidecarName } from "@/lib/playback";
import {
  ensureSpacesCors,
  isSafeStoredKey,
  isSpacesConfigured,
  makeDeliverySpacesKey,
  makeVersionSpacesKey,
  presignPut,
} from "@/lib/spaces";

export const runtime = "nodejs";

type SignKind = "version" | "playback" | "delivery";

function isAudioOrZip(filename: string, mimeType: string) {
  const name = filename.toLowerCase();
  return (
    mimeType.startsWith("audio/") ||
    mimeType === "application/zip" ||
    mimeType === "application/x-zip-compressed" ||
    /\.(mp3|wav|flac|aac|m4a|ogg|aiff|aif|zip)$/i.test(name)
  );
}

export async function POST(request: Request) {
  if (!isSpacesConfigured()) return jsonError("DigitalOcean Spaces is not configured", 400);
  // Soft-fail: many Spaces keys cannot Get/PutBucketCors. Uploads still need CORS set in the DO UI.
  void ensureSpacesCors(request.headers.get("origin")).catch(() => undefined);

  const body = (await request.json().catch(() => null)) as {
    kind?: SignKind;
    filename?: string;
    mimeType?: string;
    projectId?: string;
    trackId?: string;
    versionId?: string;
    storedFilename?: string;
    token?: string;
    deliveryKind?: "final" | "stem";
    title?: string;
  } | null;

  if (!body) return jsonError("Invalid request");
  const kind = body.kind;
  const filename = body?.filename?.trim() ?? "";
  const mimeType = body?.mimeType?.trim() ?? "application/octet-stream";
  if (kind !== "version" && kind !== "playback" && kind !== "delivery") {
    return jsonError("Kind must be version, playback, or delivery");
  }
  if (!filename) return jsonError("Filename is required");

  const user = await getSessionUser();

  if (kind === "version") {
    if (!user) return jsonError("Unauthorized", 401);
    const projectId = body.projectId?.trim() ?? "";
    const access = getProjectAccess(projectId, user.userId);
    if (!access) return jsonError("Not found", 404);
    if (!isAudioOrZip(filename, mimeType) && !mimeType.startsWith("audio/")) {
      return jsonError("Please upload an audio file");
    }
    let trackId = body.trackId?.trim() ?? "";
    if (trackId) {
      const write = canManageTrackMedia(user.userId, trackId);
      if (!write || write.project.id !== projectId) {
        return jsonError("Only the track owner can add versions", 403);
      }
    } else {
      // Allocate track folder before upload so Spaces keys live under tracks/{id}/versions/
      trackId = createTrack(
        projectId,
        body.title?.trim() || titleFromFilename(filename),
        user.userId,
      ).id;
    }
    const key = makeVersionSpacesKey(trackId, filename, mimeType);
    const signed = await presignPut(key, mimeType);
    return Response.json({ ...signed, trackId });
  }

  if (kind === "delivery") {
    if (!user) return jsonError("Unauthorized", 401);
    const trackId = body.trackId?.trim() ?? "";
    if (!trackId) return jsonError("Track is required");
    const access = canManageTrackMedia(user.userId, trackId);
    if (!access) return jsonError("Only the track owner can upload finals and stems", 403);
    if (!isTrackApproved(trackId)) return jsonError("Approve the track before uploading finals and stems");
    if (!isAudioOrZip(filename, mimeType)) return jsonError("Please upload audio or zip files");
    const deliveryKind = body.deliveryKind === "final" ? "final" : "stem";
    const key = makeDeliverySpacesKey(trackId, deliveryKind, filename, mimeType);
    const signed = await presignPut(key, mimeType);
    return Response.json({ ...signed, trackId });
  }

  const versionId = body.versionId?.trim() ?? "";
  const storedFilename = body.storedFilename?.trim() ?? "";
  if (versionId) {
    const access = getVersionAccess(versionId);
    if (!access) return jsonError("Not found", 404);
    const shared = isTrackSharedWithStudio(access.track, access.project);
    const token = body.token?.trim() ?? "";
    const projectAccess = user ? getProjectAccess(access.project.id, user.userId) : null;
    const isAdmin = projectAccess?.kind === "admin" && shared;
    const isComposer = projectAccess?.kind === "composer" && access.track.composerId === user?.userId;
    const isShare = token === access.project.shareToken && shared;
    if (!isAdmin && !isComposer && !isShare) return jsonError("Unauthorized", 401);
    if (!mimeType.includes("mpeg") && !mimeType.includes("mp3") && !/\.mp3$/i.test(filename)) {
      return jsonError("Playback file must be an MP3");
    }
    const key = playbackSidecarName(access.version.storedFilename);
    const signed = await presignPut(key, "audio/mpeg");
    return Response.json(signed);
  }

  if (!user) return jsonError("Unauthorized", 401);
  const projectId = body.projectId?.trim() ?? "";
  const access = getProjectAccess(projectId, user.userId);
  if (!access) return jsonError("Not found", 404);
  if (!isSafeStoredKey(storedFilename)) return jsonError("Invalid storage key");
  if (!mimeType.includes("mpeg") && !mimeType.includes("mp3") && !/\.mp3$/i.test(filename)) {
    return jsonError("Playback file must be an MP3");
  }
  const key = playbackSidecarName(storedFilename);
  const signed = await presignPut(key, "audio/mpeg");
  return Response.json(signed);
}
