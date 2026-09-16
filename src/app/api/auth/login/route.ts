import { compareSync } from "bcryptjs";
import { saveLogin } from "@/lib/auth";
import { findUserByEmail } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) return jsonError("Email and password are required");

  const user = findUserByEmail(email);
  if (!user || !compareSync(password, user.passwordHash)) {
    return jsonError("Invalid email or password", 401);
  }

  await saveLogin(user.id);
  return Response.json({ ok: true, role: user.role });
}
