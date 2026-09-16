import { appleMusicTitleFromUrl, parseAppleMusicSong } from "@/lib/apple-music";
import { getSessionUser } from "@/lib/auth";
import { canManageTrackMedia, createReference } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const body = (await request.json().catch(() => null)) as {
    trackId?: string;
    url?: string;
    title?: string;
  } | null;
  const trackId = body?.trackId ?? "";
  const url = body?.url?.trim() ?? "";
  if (!canManageTrackMedia(user.userId, trackId)) {
    return jsonError("Only the track owner can add Apple Music references", 403);
  }
  const song = parseAppleMusicSong(url);
  if (!song) {
    return jsonError("Paste a link to a specific Apple Music song, not an album");
  }
  const title = body?.title?.trim() || appleMusicTitleFromUrl(url);
  const reference = createReference(trackId, url, title);
  return Response.json({ reference });
}
