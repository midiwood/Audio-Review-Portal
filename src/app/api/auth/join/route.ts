import fs from "node:fs";
import { compareSync, hashSync } from "bcryptjs";
import { saveLogin } from "@/lib/auth";
import {
  addProjectMember,
  createUser,
  findUserByEmail,
  getProjectByInviteToken,
} from "@/lib/data";
import { extensionFor } from "@/lib/format";
import { jsonError } from "@/lib/http";
import { avatarFilePath } from "@/lib/paths";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const photo = form.get("photo");

  const project = getProjectByInviteToken(token);
  if (!project) return jsonError("Invite link is invalid", 404);
  if (!email || !password) return jsonError("Email and password are required");

  const existing = findUserByEmail(email);
  if (existing) {
    if (!compareSync(password, existing.passwordHash)) {
      return jsonError("That email already has an account. Use the correct password to join.", 401);
    }
    addProjectMember(project.id, existing.id);
    await saveLogin(existing.id);
    return Response.json({ ok: true, projectId: project.id });
  }

  if (!name) return jsonError("Name is required");
  if (!(photo instanceof File) || photo.size === 0) return jsonError("A profile photo is required");
  if (!photo.type.startsWith("image/")) return jsonError("Profile photo must be an image");

  const ext = extensionFor(photo.name, photo.type) || ".jpg";
  const filename = `${crypto.randomUUID()}${ext === ".bin" ? ".jpg" : ext}`;
  fs.writeFileSync(avatarFilePath(filename), Buffer.from(await photo.arrayBuffer()));

  const user = createUser({
    email,
    name,
    passwordHash: hashSync(password, 10),
    role: "composer",
    avatarFilename: filename,
  });
  addProjectMember(project.id, user.id);
  await saveLogin(user.id);
  return Response.json({ ok: true, projectId: project.id });
}
