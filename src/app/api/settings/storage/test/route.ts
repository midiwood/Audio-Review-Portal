import { getSessionUser, isSuperadmin } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { applySpacesCors, loadSpacesSettings, testSpacesConnection, type SpacesSettings } from "@/lib/spaces";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!isSuperadmin(user)) return jsonError("Forbidden", 403);

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    region?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    cdnHost?: string;
    origin?: string;
  } | null;

  try {
    let settings = loadSpacesSettings();
    if (body?.endpoint && body.region && body.bucket && body.accessKey) {
      const secretKey = body.secretKey?.trim() || settings?.secretKey;
      if (!secretKey) return jsonError("Secret key is required to test");
      settings = {
        endpoint: body.endpoint.trim(),
        region: body.region.trim(),
        bucket: body.bucket.trim(),
        accessKey: body.accessKey.trim(),
        secretKey,
        cdnHost: body.cdnHost?.trim() ?? "",
      } satisfies SpacesSettings;
    }
    await testSpacesConnection(settings);
    const origin = body?.origin?.trim() || request.headers.get("origin") || "";
    let corsApplied = false;
    let corsManual = false;
    let corsError: string | null = null;
    try {
      await applySpacesCors(origin ? [origin] : [], settings);
      corsApplied = true;
    } catch (err) {
      corsManual = true;
      corsError = err instanceof Error ? err.message : String(err);
    }
    return Response.json({ ok: true, corsApplied, corsManual, corsError });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Could not reach Spaces", 400);
  }
}
