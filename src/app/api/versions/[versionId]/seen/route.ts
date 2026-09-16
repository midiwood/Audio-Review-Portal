import { getSessionUser } from "@/lib/auth";
import { getVersionAccess, markVersionSeen } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ versionId: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { versionId } = await context.params;
  const access = getVersionAccess(versionId);
  if (!access || access.project.ownerId !== user.userId) return jsonError("Not found", 404);
  markVersionSeen(versionId);
  return Response.json({ ok: true });
}
