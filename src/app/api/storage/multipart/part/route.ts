import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { isSafeStoredKey, isSpacesConfigured, uploadMultipartPart } from "@/lib/spaces";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  if (!isSpacesConfigured()) return jsonError("DigitalOcean Spaces is not configured", 400);
  const user = await getSessionUser();
  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim() ?? "";
  const uploadId = url.searchParams.get("uploadId")?.trim() ?? "";
  const partNumber = Number(url.searchParams.get("partNumber") ?? "0");
  if (!isSafeStoredKey(key) || !uploadId || !Number.isInteger(partNumber) || partNumber < 1) {
    return jsonError("Invalid part request");
  }
  // Playback sidecars may be uploaded by share reviewers without a session.
  if (!user && !key.endsWith(".play.mp3")) return jsonError("Unauthorized", 401);

  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.byteLength === 0) return jsonError("Empty part");
    const part = await uploadMultipartPart(key, uploadId, partNumber, bytes);
    return Response.json(part);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not upload part", 500);
  }
}
