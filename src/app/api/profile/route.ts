import { compareSync, hashSync } from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { removeAvatarFile, saveOptionalAvatar } from "@/lib/avatar-server";
import { findUserByEmail, findUserById, toProfileDto, updateUser } from "@/lib/data";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return jsonError("Unauthorized", 401);
  const user = findUserById(session.userId);
  if (!user) return jsonError("Unauthorized", 401);
  return Response.json({ user: toProfileDto(user) });
}

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) return jsonError("Unauthorized", 401);
  const user = findUserById(session.userId);
  if (!user) return jsonError("Unauthorized", 401);

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");

  if (!name) return jsonError("Name is required");
  if (!email || !email.includes("@")) return jsonError("A valid email is required");

  const emailChanged = email !== user.email;
  const passwordChanged = Boolean(newPassword);
  if (emailChanged || passwordChanged) {
    if (!currentPassword) return jsonError("Current password is required to change email or password");
    if (!compareSync(currentPassword, user.passwordHash)) return jsonError("Current password is incorrect", 401);
  }
  if (passwordChanged && newPassword.length < 6) return jsonError("New password must be at least 6 characters");

  if (emailChanged) {
    const taken = findUserByEmail(email);
    if (taken && taken.id !== user.id) return jsonError("That email is already in use");
  }

  let avatarFilename = user.avatarFilename;
  try {
    const nextAvatar = await saveOptionalAvatar(form.get("photo"));
    if (nextAvatar) {
      removeAvatarFile(user.avatarFilename);
      avatarFilename = nextAvatar;
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Invalid profile photo");
  }

  const updated = updateUser(user.id, {
    name,
    email,
    passwordHash: passwordChanged ? hashSync(newPassword, 10) : undefined,
    avatarFilename,
  });
  return Response.json({ user: toProfileDto(updated) });
}
