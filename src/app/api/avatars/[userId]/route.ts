import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { findUserById, updateUser } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { avatarFilePath } from "@/lib/paths";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  const user = findUserById(userId);
  if (!user?.avatarFilename) return jsonError("Not found", 404);
  const filePath = avatarFilePath(user.avatarFilename);
  if (!existsSync(filePath)) {
    // Stale DB pointer after deploy without data/avatars — clear so UI stops requesting it.
    try {
      updateUser(userId, { avatarFilename: null });
    } catch {
      /* ignore */
    }
    return jsonError("Not found", 404);
  }
  try {
    const stat = statSync(filePath);
    const stream = createReadStream(filePath);
    const ext = user.avatarFilename.toLowerCase();
    const type = ext.endsWith(".png")
      ? "image/png"
      : ext.endsWith(".webp")
        ? "image/webp"
        : ext.endsWith(".gif")
          ? "image/gif"
          : "image/jpeg";
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return jsonError("Not found", 404);
  }
}
