import { ensureSpacesCors, isSpacesConfigured } from "@/lib/spaces";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const enabled = isSpacesConfigured();
  let corsOk: boolean | null = null;
  let corsManual = false;
  let corsError: string | null = null;
  if (enabled) {
    const origin = request.headers.get("origin") || "http://localhost:3001";
    const result = await ensureSpacesCors(origin);
    corsOk = result.ok;
    corsManual = Boolean(result.manualRequired);
    corsError = result.error;
  }
  return Response.json({ enabled, corsOk, corsManual, corsError });
}
