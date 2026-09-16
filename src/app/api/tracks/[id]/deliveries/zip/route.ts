import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { getSessionUser } from "@/lib/auth";
import { contentDisposition, downloadFilename } from "@/lib/audio-format";
import { canAccessDeliveries, getTrackAccess, listDeliveriesForTrack } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { storedFilePath } from "@/lib/paths";
import { openStoredFileStream } from "@/lib/stored-file-stream";
import { isSpacesConfigured, spacesObjectExists } from "@/lib/spaces";

export const runtime = "nodejs";

function zipEntryName(kind: string, originalFilename: string, used: Set<string>) {
  const folder = kind === "final" ? "Finals" : "Stems";
  const base = downloadFilename(originalFilename);
  let name = `${folder}/${base}`;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    name = `${folder}/${stem}-${n}${ext}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  const { id } = await context.params;
  const access = getTrackAccess(id);
  const allowed = access ? canAccessDeliveries(user.userId, id) : null;
  if (!access || allowed?.kind !== "admin") return jsonError("Not found", 404);

  const rows = listDeliveriesForTrack(id);
  if (rows.length === 0) return jsonError("No finals or stems to download", 404);

  const spaces = isSpacesConfigured();

  const archive = new ZipArchive({ store: true, zlib: { level: 0 } });
  archive.on("error", (err) => {
    console.error("Zip download failed", err);
  });

  const used = new Set<string>();
  for (const row of rows) {
    const name = zipEntryName(row.kind, row.originalFilename, used);
    if (spaces && (await spacesObjectExists(row.storedFilename))) {
      archive.append(await openStoredFileStream(row.storedFilename), { name, store: true });
    } else {
      archive.append(createReadStream(storedFilePath(row.storedFilename)), { name, store: true });
    }
  }

  void archive.finalize();
  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${access.track.title}-finals-stems.zip`),
      "Cache-Control": "no-store",
    },
  });
}
