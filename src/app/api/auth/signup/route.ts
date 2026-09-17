import { hashSync } from "bcryptjs";
import { saveLogin } from "@/lib/auth";
import { saveOptionalAvatar } from "@/lib/avatar-server";
import { createUser, emailTaken } from "@/lib/data";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "").trim();

  if (!email || !password) return jsonError("Email and password are required");
  if (password.length < 8) return jsonError("Password must be at least 8 characters");
  if (!name) return jsonError("Name is required");
  if (emailTaken(email)) return jsonError("An account with that email already exists", 409);

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
  await saveLogin(user.id);
  return Response.json({ ok: true });
}
