import { getSessionUser, isSuperadmin } from "@/lib/auth";
import { setUserSubscribed, softDeleteUser } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError("Unauthorized", 401);
  if (!isSuperadmin(session)) return jsonError("Forbidden", 403);

  const { userId } = await context.params;
  const body = (await request.json().catch(() => null)) as { subscribed?: boolean } | null;
  if (typeof body?.subscribed !== "boolean") return jsonError("subscribed boolean required");

  const user = setUserSubscribed(userId, body.subscribed);
  if (!user) return jsonError("Not found", 404);
  return Response.json({ user });
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError("Unauthorized", 401);
  if (!isSuperadmin(session)) return jsonError("Forbidden", 403);

  const { userId } = await context.params;
  const result = softDeleteUser(userId, session.userId);
  if (!result.ok) {
    const status = result.error === "Not found" ? 404 : 400;
    return jsonError(result.error, status);
  }
  return Response.json({ ok: true });
}
