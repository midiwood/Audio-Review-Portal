import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { storedFilePath } from "@/lib/paths";
import { getSpacesObject, isSpacesConfigured, spacesObjectExists } from "@/lib/spaces";

/** Readable stream for a stored file — Spaces via server, else local disk. */
export async function openStoredFileStream(storedFilename: string) {
  if (isSpacesConfigured() && (await spacesObjectExists(storedFilename))) {
    const obj = await getSpacesObject(storedFilename);
    if (!obj.body) throw new Error("Missing file in Spaces");
    const body = obj.body as Readable & { transformToByteArray?: () => Promise<Uint8Array> };
    if (typeof body.pipe === "function") return body;
    if (typeof body.transformToByteArray === "function") {
      const bytes = await body.transformToByteArray();
      return Readable.from(Buffer.from(bytes));
    }
    throw new Error("Unsupported Spaces body stream");
  }
  return createReadStream(storedFilePath(storedFilename));
}
