import fs from "node:fs";
import path from "node:path";
import { storedFilePath } from "@/lib/paths";
import { needsMp3Playback } from "@/lib/audio-format";
import { deleteSpacesObject, isSafeStoredKey, isSpacesConfigured } from "@/lib/spaces";

const PLAYBACK_SUFFIX = ".play.mp3";
const LEGACY_M4A_SUFFIX = ".play.m4a";
const READY_SUFFIX = ".play.ready";

export function playbackSidecarName(storedFilename: string) {
  return `${storedFilename}${PLAYBACK_SUFFIX}`;
}

function legacyM4aName(storedFilename: string) {
  return `${storedFilename}${LEGACY_M4A_SUFFIX}`;
}

export function playbackReadyMarkerName(storedFilename: string) {
  return `${storedFilename}${READY_SUFFIX}`;
}

export function filesToUnlink(storedFilename: string) {
  const mp3 = playbackSidecarName(storedFilename);
  const m4a = legacyM4aName(storedFilename);
  return [storedFilename, mp3, m4a, `${m4a}.part.m4a`, playbackReadyMarkerName(storedFilename)];
}

export function unlinkStoredAudio(storedFilename: string) {
  for (const name of filesToUnlink(storedFilename)) {
    try {
      fs.unlinkSync(storedFilePath(name));
    } catch {
      /* already gone */
    }
  }
}

export async function removeStoredAudio(storedFilename: string) {
  unlinkStoredAudio(storedFilename);
  await Promise.all(
    [storedFilename, playbackSidecarName(storedFilename), legacyM4aName(storedFilename)].map((key) =>
      deleteSpacesObject(key),
    ),
  );
}

export function markPlaybackReady(storedFilename: string) {
  const dest = storedFilePath(playbackReadyMarkerName(storedFilename));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, "1");
}

function nonemptyFile(filePath: string) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

export function hasPlaybackSidecar(storedFilename: string) {
  return (
    nonemptyFile(storedFilePath(playbackSidecarName(storedFilename))) ||
    nonemptyFile(storedFilePath(legacyM4aName(storedFilename))) ||
    nonemptyFile(storedFilePath(playbackReadyMarkerName(storedFilename)))
  );
}

export function isPlaybackReady(storedFilename: string, originalFilename: string, mimeType: string) {
  if (!needsMp3Playback(originalFilename, mimeType)) return true;
  if (hasPlaybackSidecar(storedFilename)) return true;
  // Spaces-backed originals stream via /api/audio without a local MP3 sidecar.
  // Avoid blocking the waveform on browser ffmpeg.wasm (cPanel has no server ffmpeg).
  if (isSpacesConfigured() && isSafeStoredKey(storedFilename)) return true;
  return false;
}

export function savePlaybackSidecar(storedFilename: string, bytes: Uint8Array | Buffer) {
  const dest = storedFilePath(playbackSidecarName(storedFilename));
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, dest);
}

export function resolvePlayableAudio(storedFilename: string, mimeType: string, original = false) {
  const source = storedFilePath(storedFilename);
  if (original) {
    return { filePath: source, mimeType: mimeType || "application/octet-stream" };
  }
  const mp3 = storedFilePath(playbackSidecarName(storedFilename));
  if (nonemptyFile(mp3)) return { filePath: mp3, mimeType: "audio/mpeg" };
  const m4a = storedFilePath(legacyM4aName(storedFilename));
  if (nonemptyFile(m4a)) return { filePath: m4a, mimeType: "audio/mp4" };
  return { filePath: source, mimeType: mimeType || "application/octet-stream" };
}
