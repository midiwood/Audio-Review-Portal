import { getSessionUser, isSuperadmin } from "@/lib/auth";
import { setUserPlan, softDeleteUser } from "@/lib/data";
import { jsonError } from "@/lib/http";
import type { AccountPlan } from "@/lib/types";

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError("Unauthorized", 401);
  if (!isSuperadmin(session)) return jsonError("Forbidden", 403);

  const { userId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    plan?: AccountPlan;
    subscribed?: boolean;
  } | null;

  let plan: "free" | "subscriber" | "label" | null = null;
  if (body?.plan === "free" || body?.plan === "subscriber" || body?.plan === "label") {
    plan = body.plan;
  } else if (typeof body?.subscribed === "boolean") {
    plan = body.subscribed ? "subscriber" : "free";
  }
  if (!plan) return jsonError("plan must be free, subscriber, or label");

  const user = setUserPlan(userId, plan);
  if (!user) return jsonError("Not found", 404);
  return Response.json({ user });
}

export async function DELETE(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const session = await getSessionUser();
  if (!session) return jsonError("Unauthorized", 401);
  if (!isSuperadmin(session)) return jsonError("Forbidden", 403);

  const { userId } = await context.params;
  const result = softDeleteUser(userId, session.userId);
  if (!result.ok) {
    const status = result.error === "Not found" ? 404 : 400;
    return jsonError(result.error, status);
  }
  return Response.json({ ok: true });
}
