import { getSessionUser } from "@/lib/auth";
import { getTrackAccess, markTrackSeen } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getTrackAccess(id);
  if (!access || access.project.ownerId !== user.userId) return jsonError("Not found", 404);
  markTrackSeen(id);
  return Response.json({ ok: true });
}
