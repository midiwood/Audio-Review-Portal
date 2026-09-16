import { getSessionUser } from "@/lib/auth";
import { countUnreadNotifications, listNotificationsForUser } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const notifications = listNotificationsForUser(user.userId);
  const unreadCount = countUnreadNotifications(user.userId);
  return Response.json({ notifications, unreadCount });
}
