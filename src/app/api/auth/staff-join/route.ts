import { compareSync, hashSync } from "bcryptjs";
import { saveLogin } from "@/lib/auth";
import { saveOptionalAvatar } from "@/lib/avatar-server";
import {
  createUser,
  findUserByEmail,
  getLabelByStaffInviteToken,
  joinAsLabelStaff,
  normalizeAccountPlan,
} from "@/lib/data";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();

  const label = getLabelByStaffInviteToken(token);
  if (!label) return jsonError("Staff invite link is invalid", 404);
  if (!email || !password) return jsonError("Email and password are required");

  const existing = findUserByEmail(email);
  if (existing) {
    if (!compareSync(password, existing.passwordHash)) {
      return jsonError("That email already has an account. Use the correct password to join.", 401);
    }
    const plan = normalizeAccountPlan(existing.plan, existing.subscribed);
    if (plan === "subscriber" || plan === "label") {
      return jsonError("That account already has its own plan", 400);
    }
    const result = joinAsLabelStaff(label.id, existing.id);
    if (!result.ok) return jsonError(result.error, 400);
    await saveLogin(existing.id);
    return Response.json({ ok: true });
  }

  if (!name) return jsonError("Name is required");

  let avatarFilename: string | null = null;
  try {
    avatarFilename = await saveOptionalAvatar(form.get("photo"));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid profile photo");
  }

  const user = createUser({
    email,
    name,
    passwordHash: hashSync(password, 10),
    role: "member",
    plan: "staff",
    labelId: label.id,
    avatarFilename,
  });
  await saveLogin(user.id);
  return Response.json({ ok: true });
}
