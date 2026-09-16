import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { contentDisposition, downloadFilename } from "@/lib/audio-format";
import { storedFilePath } from "@/lib/paths";
import { playbackReadyMarkerName, playbackSidecarName, resolvePlayableAudio } from "@/lib/playback";
import { getSpacesObject, isSpacesConfigured, presignGet, spacesObjectExists } from "@/lib/spaces";

async function spacesPlayKey(storedFilename: string, original: boolean) {
  if (original) {
    return (await spacesObjectExists(storedFilename)) ? storedFilename : null;
  }
  const sidecar = playbackSidecarName(storedFilename);
  if (existsSync(storedFilePath(playbackReadyMarkerName(storedFilename)))) return sidecar;
  if (await spacesObjectExists(sidecar)) return sidecar;
  if (await spacesObjectExists(`${storedFilename}.play.m4a`)) return `${storedFilename}.play.m4a`;
  if (await spacesObjectExists(storedFilename)) return storedFilename;
  return null;
}

function mimeForSpacesKey(key: string, fallback: string) {
  if (key.endsWith(".play.mp3")) return "audio/mpeg";
  if (key.endsWith(".play.m4a")) return "audio/mp4";
  return fallback || "application/octet-stream";
}

function bodyToWebStream(body: unknown): ReadableStream {
  if (body && typeof body === "object" && "transformToWebStream" in body) {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream();
  }
  return Readable.toWeb(body as Readable) as ReadableStream;
}

async function streamFromSpaces(options: {
  key: string;
  mimeType: string;
  downloadName?: string;
  range?: string | null;
}) {
  const obj = await getSpacesObject(options.key, options.range ?? null);
  if (!obj.body) throw new Error("Empty Spaces object body");

  const mimeType = obj.contentType || mimeForSpacesKey(options.key, options.mimeType);
  const headers: Record<string, string> = {
    "Content-Type": mimeType,
    "Accept-Ranges": obj.acceptRanges || "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (obj.contentLength != null) headers["Content-Length"] = String(obj.contentLength);
  if (obj.contentRange) headers["Content-Range"] = obj.contentRange;
  if (obj.etag) headers.ETag = obj.etag;
  if (options.downloadName) headers["Content-Disposition"] = contentDisposition(options.downloadName);

  return new Response(bodyToWebStream(obj.body), {
    status: obj.partial ? 206 : 200,
    headers,
  });
}

export async function redirectOrStreamStoredFile(options: {
  storedFilename: string;
  mimeType: string;
  original?: boolean;
  downloadName?: string;
  range?: string | null;
}) {
  const original = Boolean(options.original || options.downloadName);
  if (isSpacesConfigured()) {
    const key = await spacesPlayKey(options.storedFilename, original);
    if (key) {
      // Downloads: 302 to signed URL (browser navigation, no CORS). Playback: proxy
      // through this origin so WaveSurfer fetch is same-origin (Spaces CORS unavailable).
      if (options.downloadName) {
        const url = await presignGet(key, {
          contentType: mimeForSpacesKey(key, options.mimeType),
          filename: downloadFilename(options.downloadName),
        });
        return Response.redirect(url, 302);
      }
      return streamFromSpaces({
        key,
        mimeType: options.mimeType,
        range: options.range ?? null,
      });
    }
  }

  const playable = resolvePlayableAudio(options.storedFilename, options.mimeType, original);
  const filePath = options.downloadName && original ? storedFilePath(options.storedFilename) : playable.filePath;
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const mimeType = options.downloadName
    ? options.mimeType || playable.mimeType
    : original
      ? options.mimeType || playable.mimeType
      : playable.mimeType;
  const extraHeaders: Record<string, string> = {};
  if (options.downloadName) extraHeaders["Content-Disposition"] = contentDisposition(options.downloadName);
  const range = options.downloadName ? null : options.range ?? null;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : fileSize - 1;
    if (start >= fileSize || end >= fileSize || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }
    const stream = createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
        ...extraHeaders,
      },
    });
  }

  const stream = createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Length": String(fileSize),
      "Accept-Ranges": "bytes",
      "Content-Type": mimeType,
      "Cache-Control": "private, max-age=3600",
      ...extraHeaders,
    },
  });
}
