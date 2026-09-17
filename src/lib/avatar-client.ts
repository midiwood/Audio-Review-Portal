/** Client-side avatar prep: square crop, ≤256px, JPEG ~80–100KB. */

const MAX_EDGE = 256;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 120_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Resize + center-crop to a square JPEG suitable for avatars.
 * Returns null when no file / empty. Throws if the file is not an image.
 */
export async function prepareAvatarFile(file: File | null | undefined): Promise<File | null> {
  if (!file || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("Profile photo must be an image");

  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  if (!side) throw new Error("Could not read image");

  const sx = ((img.naturalWidth || img.width) - side) / 2;
  const sy = ((img.naturalHeight || img.height) - side) / 2;
  const edge = Math.min(MAX_EDGE, side);

  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, edge, edge);

  let quality = JPEG_QUALITY;
  let blob = await encodeCanvas(canvas, quality);
  while (blob.size > MAX_BYTES && quality > 0.5) {
    quality -= 0.08;
    blob = await encodeCanvas(canvas, quality);
  }

  const base = file.name.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

/** Append a prepared avatar onto FormData under `photo`, or omit if none. */
export async function appendPreparedAvatar(form: FormData, file: File | null | undefined) {
  form.delete("photo");
  const prepared = await prepareAvatarFile(file);
  if (prepared) form.set("photo", prepared);
}
