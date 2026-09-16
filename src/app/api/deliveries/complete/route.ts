import { getSessionUser } from "@/lib/auth";
import { canManageTrackMedia, createDelivery, isTrackApproved } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { isSafeStoredKey, isSpacesConfigured, spacesObjectExists } from "@/lib/spaces";
import type { DeliveryKind } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!isSpacesConfigured()) return jsonError("DigitalOcean Spaces is not configured", 400);

  const body = (await request.json().catch(() => null)) as {
    trackId?: string;
    kind?: DeliveryKind;
    files?: { originalFilename: string; mimeType: string; storedFilename: string }[];
  } | null;

  const trackId = body?.trackId?.trim() ?? "";
  const kind = body?.kind;
  const files = body?.files ?? [];
  if (!trackId) return jsonError("Track is required");
  if (kind !== "final" && kind !== "stem") return jsonError("Kind must be final or stem");
  if (files.length === 0) return jsonError("Audio or zip files are required");

  const access = canManageTrackMedia(user.userId, trackId);
  if (!access) return jsonError("Only the track owner can upload finals and stems", 403);
  if (!isTrackApproved(trackId)) return jsonError("Approve the track before uploading finals and stems");

  for (const file of files) {
    if (!isSafeStoredKey(file.storedFilename)) return jsonError("Invalid storage key");
    if (!(await spacesObjectExists(file.storedFilename))) {
      return jsonError(`Uploaded file was not found in Spaces: ${file.originalFilename}`, 400);
    }
  }

  const created = files.map((file) =>
    createDelivery({
      trackId,
      kind,
      originalFilename: file.originalFilename,
      storedFilename: file.storedFilename,
      mimeType: file.mimeType || "application/octet-stream",
    }),
  );

  return Response.json({ deliveries: created });
}
