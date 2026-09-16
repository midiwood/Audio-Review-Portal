import { compareSync } from "bcryptjs";
import { saveLogin } from "@/lib/auth";
import { findUserByEmail } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password;
    if (!email || !password) return jsonError("Email and password are required");

    let user;
    try {
      user = findUserByEmail(email);
    } catch (err) {
      console.error("Login database error", err);
      return jsonError("Database unavailable", 500);
    }

    if (!user || !compareSync(password, user.passwordHash)) {
      return jsonError("Invalid email or password", 401);
    }

    try {
      await saveLogin(user.id);
    } catch (err) {
      console.error("Login session error", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("AUTH_SECRET")) {
        return jsonError("Server auth is misconfigured", 500);
      }
      return jsonError("Could not create session", 500);
    }

    return Response.json({ ok: true, role: user.role });
  } catch (err) {
    console.error("Login failed", err);
    return jsonError("Sign-in failed", 500);
  }
}
