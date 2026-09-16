import fs from "node:fs";
import { compareSync, hashSync } from "bcryptjs";
import { getSessionUser } from "@/lib/auth";
import { findUserByEmail, findUserById, toProfileDto, updateUser } from "@/lib/data";
import { jsonError } from "@/lib/http";
import { avatarFilePath, ensureDataDirs } from "@/lib/paths";

export const runtime = "nodejs";

function imageExtension(file: File) {
  const fromName = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "";
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(fromName)) {
    return fromName === ".jpeg" ? ".jpg" : fromName;
  }
  if (file.type === "image/png") return ".png";
  if (file.type === "image/webp") return ".webp";
  if (file.type === "image/gif") return ".gif";
  return ".jpg";
}

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
  const photo = form.get("photo");

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
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) return jsonError("Profile photo must be an image");
    ensureDataDirs();
    const filename = `${crypto.randomUUID()}${imageExtension(photo)}`;
    fs.writeFileSync(avatarFilePath(filename), Buffer.from(await photo.arrayBuffer()));
    if (user.avatarFilename) {
      try {
        fs.unlinkSync(avatarFilePath(user.avatarFilename));
      } catch {
        /* already gone */
      }
    }
    avatarFilename = filename;
  }

  const updated = updateUser(user.id, {
    name,
    email,
    passwordHash: passwordChanged ? hashSync(newPassword, 10) : undefined,
    avatarFilename,
  });
  return Response.json({ user: toProfileDto(updated) });
}
