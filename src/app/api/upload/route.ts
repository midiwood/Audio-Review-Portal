import fs from "node:fs";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";
import { canManageTrackMedia, createTrack, createVersion, getProjectAccess, isTrackApproved } from "@/lib/data";
import { extensionFor, titleFromFilename } from "@/lib/format";
import { jsonError } from "@/lib/http";
import { storedFilePath } from "@/lib/paths";
import { savePlaybackSidecar } from "@/lib/playback";

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

  if (!(file instanceof File) || file.size === 0) return jsonError("Audio file is required");
  if (!file.type.startsWith(ALLOWED_PREFIX) && !/\.(mp3|wav|flac|aac|m4a|ogg|aiff|aif)$/i.test(file.name)) {
    return jsonError("Please upload an audio file");
  }

  const access = getProjectAccess(projectId, user.userId);
  if (!access) return jsonError("Not found", 404);

  let trackId = existingTrackId;
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

  // Draft until the owner publishes for review.
  const version = createVersion({
    trackId,
    originalFilename: file.name,
    storedFilename,
    mimeType,
    status: "in_progress",
    unreadForAdmin: false,
  });

  return Response.json({ version, trackId });
}
