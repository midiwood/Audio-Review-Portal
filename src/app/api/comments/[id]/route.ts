import { getSessionUser } from "@/lib/auth";
import {
  canManageTrackMedia,
  deleteComment,
  getCommentAccess,
  getProjectAccess,
  isCommentAuthor,
  isTrackSharedWithStudio,
  updateCommentBody,
  updateCommentResolved,
} from "@/lib/data";
import { jsonError } from "@/lib/http";

function authorizeCommentAuthor(
  access: NonNullable<ReturnType<typeof getCommentAccess>>,
  userId: string | undefined,
  body: { authorName?: string; token?: string } | null,
) {
  const shared = isTrackSharedWithStudio(access.track, access.project);
  const viaShare = Boolean(body?.token && body.token === access.project.shareToken && shared);
  if (!userId && !viaShare) return false;
  return isCommentAuthor(access.comment, {
    userId,
    authorName: body?.authorName ?? null,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = getCommentAccess(id);
  if (!access) return jsonError("Not found", 404);

  const body = (await request.json().catch(() => null)) as {
    resolved?: boolean;
    body?: string;
    authorName?: string;
    token?: string;
  } | null;

  const user = await getSessionUser();

  if (typeof body?.resolved === "boolean") {
    const projectAccess = user ? getProjectAccess(access.project.id, user.userId) : null;
    const isAdmin = projectAccess?.kind === "admin";
    const isOwner = user ? Boolean(canManageTrackMedia(user.userId, access.track.id)) : false;
    if (!user || (!isAdmin && !isOwner)) {
      return jsonError("Only the studio or track owner can mark comments done", 403);
    }
    const comment = updateCommentResolved(id, body.resolved);
    return Response.json({ comment });
  }

  const text = body?.body?.trim();
  if (!text) return jsonError("Comment is required");
  if (!authorizeCommentAuthor(access, user?.userId, body)) {
    return jsonError("Only the comment author can edit this comment", 403);
  }
  const comment = updateCommentBody(id, text);
  return Response.json({ comment });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = getCommentAccess(id);
  if (!access) return jsonError("Not found", 404);

  const body = (await request.json().catch(() => null)) as {
    authorName?: string;
    token?: string;
  } | null;

  const user = await getSessionUser();
  if (!authorizeCommentAuthor(access, user?.userId, body)) {
    return jsonError("Only the comment author can delete this comment", 403);
  }

  deleteComment(id);
  return Response.json({ ok: true });
}
