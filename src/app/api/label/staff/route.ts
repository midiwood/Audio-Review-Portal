import { getSessionUser, isLabelAccount } from "@/lib/auth";
import {
  addStaffToLabel,
  ensureStaffInviteToken,
  listInviteableStaff,
  listStaffForLabel,
  removeStaffFromLabel,
  findUserById,
  toProfileDto,
} from "@/lib/data";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!isLabelAccount(user)) return jsonError("Only label accounts manage staff", 403);

  ensureStaffInviteToken(user.userId);
  const profile = findUserById(user.userId);
  return Response.json({
    staff: listStaffForLabel(user.userId),
    inviteable: listInviteableStaff(user.userId),
    staffInviteToken: profile ? toProfileDto(profile).staffInviteToken : null,
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!isLabelAccount(user)) return jsonError("Only label accounts manage staff", 403);

  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) return jsonError("Staff member is required");

  const result = addStaffToLabel(user.userId, userId);
  if (!result.ok) return jsonError(result.error, 400);

  return Response.json({
    ok: true,
    staff: listStaffForLabel(user.userId),
    inviteable: listInviteableStaff(user.userId),
  });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!isLabelAccount(user)) return jsonError("Only label accounts manage staff", 403);

  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = body?.userId?.trim();
  if (!userId) return jsonError("Staff member is required");

  if (!removeStaffFromLabel(user.userId, userId)) {
    return jsonError("Staff member not found", 404);
  }

  return Response.json({
    ok: true,
    staff: listStaffForLabel(user.userId),
    inviteable: listInviteableStaff(user.userId),
  });
}
