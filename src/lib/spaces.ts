import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq } from "drizzle-orm";
import { extensionFor } from "@/lib/format";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secret";

export const STORAGE_SETTINGS_ID = "storage";
const PUT_EXPIRES = 15 * 60;
const GET_EXPIRES = 2 * 60 * 60;

export type SpacesSettings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  cdnHost: string;
};

export type SpacesPublicSettings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  cdnHost: string;
  hasSecret: boolean;
  configured: boolean;
};

function stripBucketFromHost(urlStr: string, bucket: string) {
  const url = new URL(urlStr.includes("://") ? urlStr : `https://${urlStr}`);
  if (bucket && url.hostname.startsWith(`${bucket}.`)) {
    url.hostname = url.hostname.slice(bucket.length + 1);
  }
  return url.origin;
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.includes("://") ? trimmed.replace(/\/+$/, "") : `https://${trimmed.replace(/\/+$/, "")}`;
}

export function loadSpacesSettings(): SpacesSettings | null {
  const row = getDb().select().from(appSettings).where(eq(appSettings.id, STORAGE_SETTINGS_ID)).get();
  if (!row) return null;
  if (!row.endpoint || !row.region || !row.bucket || !row.accessKey || !row.secretKeyEnc) return null;
  try {
    return {
      endpoint: normalizeOrigin(row.endpoint),
      region: row.region.trim(),
      bucket: row.bucket.trim(),
      accessKey: row.accessKey.trim(),
      secretKey: decryptSecret(row.secretKeyEnc),
      cdnHost: row.cdnHost ? normalizeOrigin(row.cdnHost) : "",
    };
  } catch {
    return null;
  }
}

export function isSpacesConfigured() {
  return loadSpacesSettings() !== null;
}

export function getSpacesPublicSettings(): SpacesPublicSettings {
  const row = getDb().select().from(appSettings).where(eq(appSettings.id, STORAGE_SETTINGS_ID)).get();
  const hasSecret = Boolean(row?.secretKeyEnc);
  const configured = isSpacesConfigured();
  return {
    endpoint: row?.endpoint ?? "",
    region: row?.region ?? "",
    bucket: row?.bucket ?? "",
    accessKey: row?.accessKey ?? "",
    cdnHost: row?.cdnHost ?? "",
    hasSecret,
    configured,
  };
}

export function saveSpacesSettings(input: {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey?: string;
  cdnHost: string;
}) {
  const existing = getDb().select().from(appSettings).where(eq(appSettings.id, STORAGE_SETTINGS_ID)).get();
  const secretKey = input.secretKey?.trim();
  let secretKeyEnc = existing?.secretKeyEnc ?? "";
  if (secretKey) secretKeyEnc = encryptSecret(secretKey);
  if (!secretKeyEnc) throw new Error("Secret key is required");

  const values = {
    id: STORAGE_SETTINGS_ID,
    endpoint: normalizeOrigin(input.endpoint),
    region: input.region.trim(),
    bucket: input.bucket.trim(),
    accessKey: input.accessKey.trim(),
    secretKeyEnc,
    cdnHost: input.cdnHost ? normalizeOrigin(input.cdnHost) : "",
    updatedAt: Date.now(),
  };

  if (existing) {
    getDb().update(appSettings).set(values).where(eq(appSettings.id, STORAGE_SETTINGS_ID)).run();
  } else {
    getDb().insert(appSettings).values(values).run();
  }
  return getSpacesPublicSettings();
}

function s3Client(settings: SpacesSettings, kind: "put" | "get") {
  const endpoint =
    kind === "get" && settings.cdnHost
      ? stripBucketFromHost(settings.cdnHost, settings.bucket)
      : stripBucketFromHost(settings.endpoint, settings.bucket);
  return new S3Client({
    region: settings.region,
    endpoint,
    forcePathStyle: false,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: settings.accessKey,
      secretAccessKey: settings.secretKey,
    },
  });
}

export async function testSpacesConnection(settings?: SpacesSettings | null) {
  const config = settings ?? loadSpacesSettings();
  if (!config) throw new Error("DigitalOcean Spaces is not configured");
  const client = s3Client(config, "put");
  await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
}

export async function readSpacesCors(settingsOverride?: SpacesSettings | null) {
  const settings = settingsOverride ?? loadSpacesSettings();
  if (!settings) return null;
  try {
    const out = await s3Client(settings, "put").send(new GetBucketCorsCommand({ Bucket: settings.bucket }));
    return out.CORSRules ?? [];
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function applySpacesCors(origins: string[], settingsOverride?: SpacesSettings | null) {
  const settings = settingsOverride ?? loadSpacesSettings();
  if (!settings) throw new Error("DigitalOcean Spaces is not configured");
  const allowed = [
    ...new Set(
      ["http://localhost:3001", "http://127.0.0.1:3001", ...origins.map((origin) => origin.trim())].filter(Boolean),
    ),
  ];
  await s3Client(settings, "put").send(
    new PutBucketCorsCommand({
      Bucket: settings.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowed,
            AllowedMethods: ["GET", "PUT", "HEAD", "POST", "DELETE"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "Accept-Ranges", "Content-Range", "Content-Length", "Content-Type"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  const after = await readSpacesCors(settings);
  return after;
}

export async function ensureSpacesCors(origin?: string | null) {
  const settings = loadSpacesSettings();
  if (!settings) return { ok: false as const, error: "not configured", rules: null };
  const wanted = origin?.trim() || "http://localhost:3001";
  const current = await readSpacesCors(settings);
  if (current && !Array.isArray(current) && "error" in current) {
    return { ok: false as const, error: current.error, rules: null, manualRequired: true as const };
  }
  const rules = Array.isArray(current) ? current : [];
  const ok = rules.some(
    (rule) =>
      (rule.AllowedOrigins ?? []).some((o) => o === wanted || o === "*") &&
      (rule.AllowedMethods ?? []).includes("PUT") &&
      ((rule.AllowedHeaders ?? []).includes("*") ||
        (rule.AllowedHeaders ?? []).some((h) => h.toLowerCase() === "content-type")),
  );
  if (ok) return { ok: true as const, error: null, rules: current, manualRequired: false as const };
  try {
    const after = await applySpacesCors([wanted], settings);
    return { ok: true as const, error: null, rules: after, manualRequired: false as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: message, rules: null, manualRequired: true as const };
  }
}

export async function spacesObjectExists(key: string) {
  const settings = loadSpacesSettings();
  if (!settings) return false;
  try {
    await s3Client(settings, "put").send(new HeadObjectCommand({ Bucket: settings.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function presignPut(key: string, contentType: string) {
  const settings = loadSpacesSettings();
  if (!settings) throw new Error("DigitalOcean Spaces is not configured");
  // Omit ContentType from the signed request so the browser PUT does not need a matching
  // Content-Type signed header (DO Spaces + fetch File bodies are unreliable with that).
  const command = new PutObjectCommand({
    Bucket: settings.bucket,
    Key: key,
  });
  const uploadUrl = await getSignedUrl(s3Client(settings, "put"), command, {
    expiresIn: PUT_EXPIRES,
    signableHeaders: new Set(["host"]),
    unhoistableHeaders: new Set([
      "x-amz-checksum-crc32",
      "x-amz-checksum-crc32c",
      "x-amz-sdk-checksum-algorithm",
      "x-amz-checksum-algorithm",
      "content-type",
    ]),
  });
  return { key, uploadUrl, contentType: contentType || "application/octet-stream" };
}

export async function presignGet(key: string, options?: { contentType?: string; filename?: string }) {
  const settings = loadSpacesSettings();
  if (!settings) throw new Error("DigitalOcean Spaces is not configured");
  const command = new GetObjectCommand({
    Bucket: settings.bucket,
    Key: key,
    ResponseContentType: options?.contentType,
    ResponseContentDisposition: options?.filename
      ? `attachment; filename="${options.filename.replace(/[^\x20-\x7E]/g, "_")}"`
      : undefined,
  });
  return getSignedUrl(s3Client(settings, "get"), command, { expiresIn: GET_EXPIRES });
}

/** Server-side GetObject for same-origin proxy (avoids browser→Spaces CORS). */
export async function getSpacesObject(key: string, range?: string | null) {
  const settings = loadSpacesSettings();
  if (!settings) throw new Error("DigitalOcean Spaces is not configured");
  const out = await s3Client(settings, "get").send(
    new GetObjectCommand({
      Bucket: settings.bucket,
      Key: key,
      Range: range || undefined,
    }),
  );
  return {
    body: out.Body,
    contentType: out.ContentType,
    contentLength: out.ContentLength,
    contentRange: out.ContentRange,
    acceptRanges: out.AcceptRanges ?? "bytes",
    etag: out.ETag,
    partial: Boolean(range),
  };
}

export async function deleteSpacesObject(key: string) {
  const settings = loadSpacesSettings();
  if (!settings) return;
  try {
    await s3Client(settings, "put").send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }));
  } catch {
    /* already gone */
  }
}

/** Wipe every object under tracks/{trackId}/ (versions, stems, finals, sidecars). */
export async function deleteSpacesTrackPrefix(trackId: string) {
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(trackId)) return { deleted: 0 };
  const settings = loadSpacesSettings();
  if (!settings) return { deleted: 0 };
  const prefix = `tracks/${trackId}/`;
  const client = s3Client(settings, "put");
  let deleted = 0;
  let token: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: settings.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      if (chunk.length === 0) continue;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: settings.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      deleted += chunk.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);

  return { deleted };
}

export function trackSpacesPrefix(trackId: string) {
  return `tracks/${trackId}/`;
}

export function makeVersionSpacesKey(trackId: string, filename: string, mimeType: string) {
  return `tracks/${trackId}/versions/${crypto.randomUUID()}${extensionFor(filename, mimeType)}`;
}

export function makeDeliverySpacesKey(
  trackId: string,
  kind: "final" | "stem",
  filename: string,
  mimeType: string,
) {
  const folder = kind === "final" ? "finals" : "stems";
  return `tracks/${trackId}/${folder}/${crypto.randomUUID()}${extensionFor(filename, mimeType)}`;
}

export async function startMultipartUpload(key: string, contentType?: string) {
  const settings = loadSpacesSettings();
  if (!settings) throw new Error("DigitalOcean Spaces is not configured");
  const out = await s3Client(settings, "put").send(
    new CreateMultipartUploadCommand({
      Bucket: settings.bucket,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  if (!out.UploadId) throw new Error("Could not start multipart upload");
  return { uploadId: out.UploadId, key };
}

export async function uploadMultipartPart(key: string, uploadId: string, partNumber: number, body: Buffer) {
  const settings = loadSpacesSettings();
  if (!settings) throw new Error("DigitalOcean Spaces is not configured");
  const out = await s3Client(settings, "put").send(
    new UploadPartCommand({
      Bucket: settings.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: body,
    }),
  );
  if (!out.ETag) throw new Error(`Could not upload part ${partNumber}`);
  return { etag: out.ETag, partNumber };
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[],
) {
  const settings = loadSpacesSettings();
  if (!settings) throw new Error("DigitalOcean Spaces is not configured");
  await s3Client(settings, "put").send(
    new CompleteMultipartUploadCommand({
      Bucket: settings.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  const settings = loadSpacesSettings();
  if (!settings) return;
  try {
    await s3Client(settings, "put").send(
      new AbortMultipartUploadCommand({
        Bucket: settings.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function isSafeStoredKey(key: string) {
  if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\")) return false;
  // Legacy flat keys (pre track-folder layout)
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}(\.play\.(mp3|m4a))?$/i.test(
      key,
    )
  ) {
    return true;
  }
  // tracks/{trackId}/(versions|stems|finals)/{uuid}.ext[.play.mp3|m4a]
  return /^tracks\/[A-Za-z0-9_-]{8,32}\/(versions|stems|finals)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}(\.play\.(mp3|m4a))?$/i.test(
    key,
  );
}
