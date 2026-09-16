export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDate(ms: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(ms);
}

export function titleFromFilename(filename: string) {
  const base = filename.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "");
  const cleaned = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Untitled";
}

export function extensionFor(filename: string, mimeType: string) {
  const fromName = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  if (fromName && fromName.length <= 8) return fromName.toLowerCase();
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav" || mimeType === "audio/wave") return ".wav";
  if (mimeType === "audio/flac") return ".flac";
  if (mimeType === "audio/aac") return ".aac";
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a") return ".m4a";
  if (mimeType === "audio/ogg") return ".ogg";
  if (mimeType === "audio/aiff" || mimeType === "audio/x-aiff") return ".aiff";
  return ".bin";
}
