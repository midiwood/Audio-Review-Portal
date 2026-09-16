"use client";

import { needsMp3Playback } from "@/lib/audio-format";
import { convertToMp3 } from "@/lib/ffmpeg-swarm";

type SignKind = "version" | "playback" | "delivery";

const CHUNK_SIZE = 5 * 1024 * 1024;

async function readError(res: Response) {
  const json = await res.json().catch(() => ({}));
  return (json as { error?: string }).error ?? `Upload failed (${res.status})`;
}

export async function spacesEnabled() {
  const res = await fetch("/api/storage/status");
  if (!res.ok) return false;
  const json = (await res.json()) as { enabled?: boolean };
  return Boolean(json.enabled);
}

async function signUpload(kind: SignKind, file: File, extra: Record<string, string> = {}) {
  const res = await fetch("/api/storage/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      ...extra,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { key: string; uploadUrl: string; contentType: string; trackId?: string };
}

/** Upload via the app server in 5MB parts — avoids browser→Spaces CORS. */
async function putFile(
  key: string,
  file: File,
  meta: { projectId?: string; trackId?: string; versionId?: string; token?: string } = {},
  onStatus?: (label: string) => void,
) {
  const startRes = await fetch("/api/storage/multipart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start",
      key,
      contentType: file.type || "application/octet-stream",
      ...meta,
    }),
  });
  if (!startRes.ok) throw new Error(await readError(startRes));
  const { uploadId } = (await startRes.json()) as { uploadId: string };

  const parts: { ETag: string; PartNumber: number }[] = [];
  try {
    let partNumber = 1;
    for (let offset = 0; offset < file.size || partNumber === 1; offset += CHUNK_SIZE) {
      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const chunk = file.slice(offset, end);
      const pct = file.size ? Math.min(100, Math.round((end / file.size) * 100)) : 100;
      onStatus?.(`Uploading… ${pct}%`);
      const partRes = await fetch(
        `/api/storage/multipart/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,
        { method: "PUT", body: chunk },
      );
      if (!partRes.ok) throw new Error(await readError(partRes));
      const part = (await partRes.json()) as { etag: string; partNumber: number };
      parts.push({ ETag: part.etag, PartNumber: part.partNumber });
      partNumber += 1;
      if (end >= file.size) break;
    }

    const completeRes = await fetch("/api/storage/multipart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", key, uploadId, parts }),
    });
    if (!completeRes.ok) throw new Error(await readError(completeRes));
  } catch (err) {
    void fetch("/api/storage/multipart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "abort", key, uploadId }),
    });
    throw err;
  }
}

export async function prepareTrackFiles(file: File, onProgress?: (ratio: number) => void) {
  if (!needsMp3Playback(file.name, file.type)) return { original: file, playback: null as File | null };
  onProgress?.(0);
  const playback = await convertToMp3(file, file.name, onProgress);
  return { original: file, playback };
}

export async function uploadVersionToSpaces(options: {
  file: File;
  projectId: string;
  trackId?: string;
  title?: string;
  onStatus?: (label: string) => void;
}) {
  const { original, playback } = await prepareTrackFiles(options.file, (ratio) => {
    options.onStatus?.(`Converting ${options.file.name} to MP3… ${Math.round(ratio * 100)}%`);
  });
  options.onStatus?.(`Uploading ${options.file.name}…`);
  const extra: Record<string, string> = { projectId: options.projectId };
  if (options.trackId) extra.trackId = options.trackId;
  if (options.title) extra.title = options.title;
  const signed = await signUpload("version", original, extra);
  const trackId = options.trackId || signed.trackId;
  if (!trackId) throw new Error("Track id missing after sign");
  await putFile(signed.key, original, { projectId: options.projectId, trackId }, options.onStatus);

  let playbackKey = "";
  if (playback) {
    options.onStatus?.("Uploading playback MP3…");
    const play = await signUpload("playback", playback, {
      projectId: options.projectId,
      storedFilename: signed.key,
    });
    await putFile(play.key, playback, { projectId: options.projectId, trackId }, options.onStatus);
    playbackKey = play.key;
  }

  const complete = await fetch("/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: options.projectId,
      trackId,
      title: options.title,
      originalFilename: original.name,
      mimeType: original.type || "application/octet-stream",
      storedFilename: signed.key,
      playbackKey: playbackKey || undefined,
    }),
  });
  if (!complete.ok) throw new Error(await readError(complete));
  return (await complete.json()) as { version: { id: string }; trackId: string };
}

export async function uploadDeliveriesToSpaces(options: {
  trackId: string;
  kind: "final" | "stem";
  files: File[];
  onStatus?: (label: string) => void;
}) {
  const uploaded: { originalFilename: string; mimeType: string; storedFilename: string }[] = [];
  for (const file of options.files) {
    options.onStatus?.(`Uploading ${file.name}…`);
    const signed = await signUpload("delivery", file, {
      trackId: options.trackId,
      deliveryKind: options.kind,
    });
    await putFile(signed.key, file, { trackId: options.trackId }, options.onStatus);
    uploaded.push({
      originalFilename: file.name,
      mimeType: file.type || "application/octet-stream",
      storedFilename: signed.key,
    });
  }
  const complete = await fetch("/api/deliveries/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId: options.trackId, kind: options.kind, files: uploaded }),
  });
  if (!complete.ok) throw new Error(await readError(complete));
  return complete.json();
}

export async function uploadPlaybackSidecarToSpaces(versionId: string, file: File, token?: string) {
  const extra: Record<string, string> = { versionId };
  if (token) extra.token = token;
  const signed = await signUpload("playback", file, extra);
  await putFile(signed.key, file, { versionId, token });
  const res = await fetch(`/api/audio/${versionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storedFilename: signed.key, token }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
