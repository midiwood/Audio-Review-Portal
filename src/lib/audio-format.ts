export function needsMp3Playback(filename: string, mimeType = "") {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();
  if (name.endsWith(".mp3") || mime === "audio/mpeg" || mime === "audio/mp3") return false;
  if (name.endsWith(".m4a") || name.endsWith(".aac") || name.endsWith(".ogg") || name.endsWith(".opus")) return false;
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("ogg") || mime.includes("opus")) return false;
  return true;
}

export function audioUrl(versionId: string, shareToken?: string, file: "play" | "original" | "download" = "play") {
  const params = new URLSearchParams();
  if (shareToken) params.set("token", shareToken);
  if (file === "download") {
    params.set("original", "1");
    params.set("download", "1");
  } else if (file === "original") {
    params.set("original", "1");
  } else {
    params.set("play", "1");
  }
  return `/api/audio/${versionId}?${params}`;
}

export function downloadFilename(originalFilename: string) {
  const base = originalFilename.replace(/^.*[/\\]/, "").replace(/[\r\n"]/g, "").trim();
  return base || "track";
}

export function contentDisposition(originalFilename: string) {
  const name = downloadFilename(originalFilename);
  const ascii = name.replace(/[^\x20-\x7E]/g, "_") || "track";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

