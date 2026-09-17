import { compareSync, hashSync } from "bcryptjs";
import { saveLogin } from "@/lib/auth";
import { saveOptionalAvatar } from "@/lib/avatar-server";
import {
  addProjectMember,
  createUser,
  findUserByEmail,
  getProjectByInviteToken,
} from "@/lib/data";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();

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
    subscribed: false,
    avatarFilename,
  });
  addProjectMember(project.id, user.id);
  await saveLogin(user.id);
  return Response.json({ ok: true, projectId: project.id });
}
