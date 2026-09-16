import { getSessionUser } from "@/lib/auth";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);

  const body = (await request.json().catch(() => null)) as { id?: string; all?: boolean } | null;
  if (body?.all) {
    markAllNotificationsRead(user.userId);
    return Response.json({ ok: true });
  }
  const id = body?.id?.trim();
  if (!id) return jsonError("Notification id is required");
  markNotificationRead(user.userId, id);
  return Response.json({ ok: true });
}
