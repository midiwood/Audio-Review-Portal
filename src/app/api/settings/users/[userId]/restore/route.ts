import { getSessionUser, isSuperadmin } from "@/lib/auth";
import { restoreUser } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError("Unauthorized", 401);
  if (!isSuperadmin(session)) return jsonError("Forbidden", 403);

  const { userId } = await context.params;
  const result = restoreUser(userId);
  if (!result.ok) {
    const status = result.error === "Not found" ? 404 : 400;
    return jsonError(result.error, status);
  }
  return Response.json({ user: result.user });
}
