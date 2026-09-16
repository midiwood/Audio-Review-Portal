import { getSessionUser } from "@/lib/auth";
import { getProjectAccess, getVersionAccess, isTrackSharedWithStudio } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { markPlaybackReady, playbackSidecarName, savePlaybackSidecar } from "@/lib/playback";
import { isSafeStoredKey, isSpacesConfigured, spacesObjectExists } from "@/lib/spaces";
import { redirectOrStreamStoredFile } from "@/lib/stored-audio";

export const runtime = "nodejs";

function authorizeAudio(access: NonNullable<ReturnType<typeof getVersionAccess>>, token: string | null, userId: string | undefined) {
  const shared = isTrackSharedWithStudio(access.track, access.project);
  const isShare = token === access.project.shareToken && shared;
  const projectAccess = userId ? getProjectAccess(access.project.id, userId) : null;
  const isAdmin = projectAccess?.kind === "admin" && shared;
  const isComposer = projectAccess?.kind === "composer" && access.track.composerId === userId;
  return isAdmin || isComposer || isShare;
}

export async function GET(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const access = getVersionAccess(versionId);
  if (!access) return jsonError("Not found", 404);

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const user = await getSessionUser();
  if (!authorizeAudio(access, token, user?.userId)) return jsonError("Unauthorized", 401);

  try {
    const download = url.searchParams.get("download") === "1";
    const original = download || url.searchParams.get("original") === "1";
    return await redirectOrStreamStoredFile({
      storedFilename: access.version.storedFilename,
      mimeType: access.version.mimeType,
      original,
      downloadName: download ? access.version.originalFilename : undefined,
      range: download ? null : request.headers.get("range"),
    });
  } catch (err) {
    console.error("Audio playback failed", err);
    return jsonError("Could not read audio", 500);
  }
}

export async function POST(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const access = getVersionAccess(versionId);
  if (!access) return jsonError("Not found", 404);

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { token?: string; storedFilename?: string } | null;
    const user = await getSessionUser();
    if (!authorizeAudio(access, body?.token ?? null, user?.userId)) return jsonError("Unauthorized", 401);
    const key = body?.storedFilename?.trim() || playbackSidecarName(access.version.storedFilename);
    if (key !== playbackSidecarName(access.version.storedFilename) || !isSafeStoredKey(key)) {
      return jsonError("Invalid playback key");
    }
    if (isSpacesConfigured() && !(await spacesObjectExists(key))) {
      return jsonError("Playback file was not found in Spaces", 400);
    }
    markPlaybackReady(access.version.storedFilename);
    return Response.json({ ok: true, playbackReady: true });
  }

  const form = await request.formData();
  const token = String(form.get("token") ?? "") || new URL(request.url).searchParams.get("token");
  const user = await getSessionUser();
  if (!authorizeAudio(access, token, user?.userId)) return jsonError("Unauthorized", 401);

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return jsonError("MP3 file is required");
  if (!file.type.includes("mpeg") && !file.type.includes("mp3") && !/\.mp3$/i.test(file.name)) {
    return jsonError("Playback file must be an MP3");
  }

  savePlaybackSidecar(access.version.storedFilename, Buffer.from(await file.arrayBuffer()));
  return Response.json({ ok: true, playbackReady: true });
}
