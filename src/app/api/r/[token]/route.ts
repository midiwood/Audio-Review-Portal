import { getProjectByShareToken } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const project = getProjectByShareToken(token);
  if (!project) return jsonError("Not found", 404);
  return Response.json({ project });
}
