import fs from "node:fs";
import { avatarFilePath, ensureDataDirs } from "@/lib/paths";

const MAX_AVATAR_BYTES = 250_000;

/**
 * Persist an optional profile photo. Expects a small web-friendly JPEG from the client,
 * but accepts other image types. Returns the stored filename or null when no photo.
 */
export async function saveOptionalAvatar(photo: FormDataEntryValue | null): Promise<string | null> {
  if (!(photo instanceof File) || photo.size === 0) return null;
  if (!photo.type.startsWith("image/")) {
    throw new Error("Profile photo must be an image");
  }
  if (photo.size > MAX_AVATAR_BYTES) {
    throw new Error("Profile photo is too large — please use a smaller image");
  }

  ensureDataDirs();
  const filename = `${crypto.randomUUID()}.jpg`;
  fs.writeFileSync(avatarFilePath(filename), Buffer.from(await photo.arrayBuffer()));
  return filename;
}

export function removeAvatarFile(filename: string | null | undefined) {
  if (!filename) return;
  try {
    fs.unlinkSync(avatarFilePath(filename));
  } catch {
    /* already gone */
  }
}
