import fs from "node:fs";
import path from "node:path";

export function dataDir() {
  return path.join(process.cwd(), "data");
}

export function uploadsDir() {
  return path.join(dataDir(), "uploads");
}

export function dbFile() {
  return path.join(dataDir(), "app.db");
}

export function avatarsDir() {
  return path.join(dataDir(), "avatars");
}

export function ensureDataDirs() {
  fs.mkdirSync(uploadsDir(), { recursive: true });
  fs.mkdirSync(avatarsDir(), { recursive: true });
}

export function storedFilePath(storedFilename: string) {
  const parts = storedFilename.split("/").filter(Boolean);
  if (parts.some((p) => p === ".." || p === ".")) {
    throw new Error("Invalid stored filename");
  }
  return path.join(uploadsDir(), ...parts);
}

export function avatarFilePath(filename: string) {
  return path.join(avatarsDir(), filename);
}
