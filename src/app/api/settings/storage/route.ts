import { getSessionUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { applySpacesCors, getSpacesPublicSettings, saveSpacesSettings } from "@/lib/spaces";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (user.role !== "admin") return jsonError("Forbidden", 403);

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    region?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    cdnHost?: string;
    origin?: string;
  } | null;

  const endpoint = body?.endpoint?.trim() ?? "";
  const region = body?.region?.trim() ?? "";
  const bucket = body?.bucket?.trim() ?? "";
  const accessKey = body?.accessKey?.trim() ?? "";
  if (!endpoint || !region || !bucket || !accessKey) {
    return jsonError("Endpoint, region, bucket, and access key are required");
  }

  try {
    const settings = saveSpacesSettings({
      endpoint,
      region,
      bucket,
      accessKey,
      secretKey: body?.secretKey,
      cdnHost: body?.cdnHost?.trim() ?? "",
    });
    const origin = body?.origin?.trim();
    let corsApplied = false;
    let corsManual = false;
    let corsError: string | null = null;
    try {
      await applySpacesCors(origin ? [origin] : []);
      corsApplied = true;
    } catch (err) {
      corsManual = true;
      corsError = err instanceof Error ? err.message : String(err);
    }
    return Response.json({ ...settings, corsApplied, corsManual, corsError });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not save storage settings", 400);
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (user.role !== "admin") return jsonError("Forbidden", 403);
  return Response.json(getSpacesPublicSettings());
}
