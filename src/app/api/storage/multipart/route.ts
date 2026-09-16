import { getSessionUser } from "@/lib/auth";
import { canManageTrackMedia, getProjectAccess, getVersionAccess, isTrackApproved, isTrackSharedWithStudio } from "@/lib/data";
import { jsonError } from "@/lib/http";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  isSafeStoredKey,
  isSpacesConfigured,
  startMultipartUpload,
} from "@/lib/spaces";

export const runtime = "nodejs";

type Body =
  | { action: "start"; key: string; contentType?: string; projectId?: string; trackId?: string; versionId?: string; token?: string }
  | { action: "complete"; key: string; uploadId: string; parts: { ETag: string; PartNumber: number }[] }
  | { action: "abort"; key: string; uploadId: string };

async function assertCanUploadKey(
  user: Awaited<ReturnType<typeof getSessionUser>>,
  key: string,
  meta: { projectId?: string; trackId?: string; versionId?: string; token?: string },
) {
  if (!isSafeStoredKey(key)) return jsonError("Invalid storage key");
  if (key.endsWith(".play.mp3")) {
    const versionId = meta.versionId?.trim() ?? "";
    if (versionId) {
      const access = getVersionAccess(versionId);
      if (!access) return jsonError("Not found", 404);
      const shared = isTrackSharedWithStudio(access.track, access.project);
      const projectAccess = user ? getProjectAccess(access.project.id, user.userId) : null;
      const isAdmin = projectAccess?.kind === "admin" && shared;
      const isComposer = projectAccess?.kind === "composer" && access.track.composerId === user?.userId;
      const isShare = meta.token === access.project.shareToken && shared;
      if (!isAdmin && !isComposer && !isShare) return jsonError("Unauthorized", 401);
      return null;
    }
    if (!user) return jsonError("Unauthorized", 401);
    const projectId = meta.projectId?.trim() ?? "";
    const access = getProjectAccess(projectId, user.userId);
    if (!access) return jsonError("Not found", 404);
    return null;
  }
  if (!user) return jsonError("Unauthorized", 401);
  if (meta.trackId) {
    const write = canManageTrackMedia(user.userId, meta.trackId);
    if (!write) return jsonError("Forbidden", 403);
    if (!isTrackApproved(meta.trackId) && meta.projectId) {
      /* version upload on track */
    }
    return null;
  }
  const projectId = meta.projectId?.trim() ?? "";
  if (!projectId || !getProjectAccess(projectId, user.userId)) return jsonError("Not found", 404);
  return null;
}

export async function POST(request: Request) {
  if (!isSpacesConfigured()) return jsonError("DigitalOcean Spaces is not configured", 400);
  const user = await getSessionUser();
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body?.action) return jsonError("Invalid request");

  if (body.action === "start") {
    const denied = await assertCanUploadKey(user, body.key, body);
    if (denied) return denied;
    try {
      const started = await startMultipartUpload(body.key, body.contentType);
      return Response.json(started);
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Could not start upload", 500);
    }
  }

  if (body.action === "complete") {
    if (!user && !body.key.endsWith(".play.mp3")) return jsonError("Unauthorized", 401);
    if (!isSafeStoredKey(body.key) || !body.uploadId || !Array.isArray(body.parts) || body.parts.length === 0) {
      return jsonError("Invalid complete request");
    }
    try {
      await completeMultipartUpload(body.key, body.uploadId, body.parts);
      return Response.json({ ok: true });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Could not complete upload", 500);
    }
  }

  if (body.action === "abort") {
    if (!isSafeStoredKey(body.key) || !body.uploadId) return jsonError("Invalid abort request");
    await abortMultipartUpload(body.key, body.uploadId);
    return Response.json({ ok: true });
  }

  return jsonError("Unknown action");
}
