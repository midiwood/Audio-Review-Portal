import fs from "node:fs";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";
import { canManageTrackMedia, createTrack, createVersion, getProjectAccess, isTrackApproved } from "@/lib/data";
import { extensionFor, titleFromFilename } from "@/lib/format";
import { jsonError } from "@/lib/http";
import { notifyAfterVersionCreated } from "@/lib/notify";
import { storedFilePath } from "@/lib/paths";
import { savePlaybackSidecar } from "@/lib/playback";
import { isVersionStatus } from "@/lib/status";

const ALLOWED_PREFIX = "audio/";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);

  const form = await request.formData();
  const file = form.get("file");
  const playback = form.get("playback");
  const projectId = String(form.get("projectId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const existingTrackId = String(form.get("trackId") ?? "").trim();
  const requestedStatus = String(form.get("status") ?? "");

  if (!(file instanceof File) || file.size === 0) return jsonError("Audio file is required");
  if (!file.type.startsWith(ALLOWED_PREFIX) && !/\.(mp3|wav|flac|aac|m4a|ogg|aiff|aif)$/i.test(file.name)) {
    return jsonError("Please upload an audio file");
  }

  const access = getProjectAccess(projectId, user.userId);
  if (!access) return jsonError("Not found", 404);

  const isComposer = access.kind === "composer";
  const statusValue = isComposer ? "review_requested" : requestedStatus || "in_progress";
  if (!isVersionStatus(statusValue)) return jsonError("Invalid status");

  let trackId = existingTrackId;
  let wasNewTrack = false;
  if (trackId) {
    const write = canManageTrackMedia(user.userId, trackId);
    if (!write || write.project.id !== projectId) {
      return jsonError("Only the track owner can add versions", 403);
    }
    if (isTrackApproved(trackId)) {
      return jsonError("This track is approved. Upload finals and stems instead.", 403);
    }
  } else {
    trackId = createTrack(projectId, title || titleFromFilename(file.name), user.userId).id;
    wasNewTrack = true;
  }

  const mimeType = file.type || "application/octet-stream";
  const ext = extensionFor(file.name, mimeType);
  const storedFilename = `${crypto.randomUUID()}${ext}`;
  const dest = storedFilePath(storedFilename);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));

  if (playback instanceof File && playback.size > 0) {
    savePlaybackSidecar(storedFilename, Buffer.from(await playback.arrayBuffer()));
  }

  const version = createVersion({
    trackId,
    originalFilename: file.name,
    storedFilename,
    mimeType,
    status: statusValue,
    unreadForAdmin: isComposer,
  });

  await notifyAfterVersionCreated({
    projectId,
    projectName: access.project.name,
    ownerId: access.project.ownerId,
    actorUserId: user.userId,
    trackId,
    versionId: version.id,
    isComposerUpload: isComposer,
    wasNewTrack,
  });

  return Response.json({ version, trackId });
}
