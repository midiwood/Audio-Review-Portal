import fs from "node:fs";
import path from "node:path";
import { getSessionUser } from "@/lib/auth";
import { canManageTrackMedia, createDelivery, isTrackApproved } from "@/lib/data";
import { extensionFor } from "@/lib/format";
import { jsonError } from "@/lib/http";
import { storedFilePath } from "@/lib/paths";
import type { DeliveryKind } from "@/lib/types";

export const runtime = "nodejs";

function isAllowedFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("audio/") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    /\.(mp3|wav|flac|aac|m4a|ogg|aiff|aif|zip)$/i.test(name)
  );
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);

  const form = await request.formData();
  const trackId = String(form.get("trackId") ?? "").trim();
  const kind = String(form.get("kind") ?? "").trim() as DeliveryKind;
  if (!trackId) return jsonError("Track is required");
  if (kind !== "final" && kind !== "stem") return jsonError("Kind must be final or stem");

  const access = canManageTrackMedia(user.userId, trackId);
  if (!access) return jsonError("Only the track owner can upload finals and stems", 403);
  if (!isTrackApproved(trackId)) return jsonError("Approve the track before uploading finals and stems");

  const files = form.getAll("file").filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length === 0) return jsonError("Audio or zip files are required");
  if (files.some((file) => !isAllowedFile(file))) return jsonError("Please upload audio or zip files");

  const deliveries = files.map((file) => {
    const mimeType = file.type || "application/octet-stream";
    const ext = extensionFor(file.name, mimeType);
    const storedFilename = `${crypto.randomUUID()}${ext}`;
    const dest = storedFilePath(storedFilename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    return { file, mimeType, storedFilename, dest };
  });

  for (const item of deliveries) {
    fs.writeFileSync(item.dest, Buffer.from(await item.file.arrayBuffer()));
  }

  const created = deliveries.map((item) =>
    createDelivery({
      trackId,
      kind,
      originalFilename: item.file.name,
      storedFilename: item.storedFilename,
      mimeType: item.mimeType,
    }),
  );

  return Response.json({ deliveries: created });
}
