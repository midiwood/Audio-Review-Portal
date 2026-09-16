import { getSessionUser } from "@/lib/auth";
import { createComment, getComment, getProjectAccess, getVersionAccess, isTrackSharedWithStudio } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { notifyComment } from "@/lib/notify";

export async function POST(request: Request, context: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await context.params;
  const access = getVersionAccess(versionId);
  if (!access) return jsonError("Not found", 404);
  if (access.version.status === "in_progress") {
    return jsonError("Publish this version before commenting", 400);
  }

  const body = (await request.json().catch(() => null)) as {
    authorName?: string;
    body?: string;
    timestampSeconds?: number;
    parentId?: string;
    token?: string;
  } | null;

  const user = await getSessionUser();
  const projectAccess = user ? getProjectAccess(access.project.id, user.userId) : null;
  const shared = isTrackSharedWithStudio(access.track, access.project);
  const isAdmin = projectAccess?.kind === "admin" && shared;
  const isShare = body?.token === access.project.shareToken && shared;
  const isComposer = projectAccess?.kind === "composer" && access.track.composerId === user?.userId;
  const parentId = body?.parentId?.trim() || null;

  if (parentId) {
    if (!isAdmin && !isShare && !isComposer) return jsonError("Unauthorized", 401);
    const parent = getComment(parentId);
    if (!parent || parent.versionId !== versionId) return jsonError("Comment not found", 404);
  } else if (!isAdmin && !isShare) {
    return jsonError("Unauthorized", 401);
  }

  const authorName = body?.authorName?.trim();
  const text = body?.body?.trim();
  const timestampSeconds = parentId
    ? Number(getComment(parentId)?.timestampSeconds ?? 0)
    : Number(body?.timestampSeconds);
  if (!authorName) return jsonError("Name is required");
  if (!text) return jsonError("Comment is required");
  if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
    return jsonError("A valid timestamp is required");
  }

  const comment = createComment({
    versionId,
    authorName,
    authorUserId: user?.userId ?? null,
    body: text,
    timestampSeconds,
    parentId,
  });

  await notifyComment({
    projectId: access.project.id,
    projectName: access.project.name,
    ownerId: access.project.ownerId,
    trackId: access.track.id,
    trackTitle: access.track.title,
    composerId: access.track.composerId,
    versionId,
    authorUserId: user?.userId ?? null,
    authorName,
    body: text,
    isReply: Boolean(parentId),
  });

  return Response.json({ comment });
}
