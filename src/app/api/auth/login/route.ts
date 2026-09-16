import { compareSync } from "bcryptjs";
import { saveLogin } from "@/lib/auth";
import { findUserByEmail } from "@/lib/data";
import { jsonError } from "@/lib/http";

export async function POST(request: Request) {
  // #region agent log
  const dbg = (message: string, data: Record<string, unknown>, hypothesisId: string) => {
    fetch("http://127.0.0.1:7320/ingest/c57f3afe-b42b-482a-a5e2-2a9d8d044626", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e65dec" },
      body: JSON.stringify({
        sessionId: "e65dec",
        runId: "live-login",
        hypothesisId,
        location: "api/auth/login/route.ts",
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => undefined);
  };
  // #endregion

  try {
    const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    const password = body?.password;
    if (!email || !password) return jsonError("Email and password are required");

    // #region agent log
    const secretLen = process.env.AUTH_SECRET?.length ?? 0;
    dbg(
      "login attempt",
      {
        hasEmail: Boolean(email),
        authSecretLen: secretLen,
        authSecretOk: secretLen >= 32,
        nodeEnv: process.env.NODE_ENV ?? null,
        cwd: process.cwd(),
      },
      "A",
    );
    // #endregion

    let user;
    try {
      user = findUserByEmail(email);
      // #region agent log
      dbg("db lookup done", { found: Boolean(user), role: user?.role ?? null }, "B");
      // #endregion
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const errCode =
        err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : null;
      // #region agent log
      dbg(
        "db lookup failed",
        {
          error: detail,
          name: err instanceof Error ? err.name : null,
          errCode,
          dbPath: process.env.DATA_DIR || "cwd/data",
          cwd: process.cwd(),
        },
        "B",
      );
      // #endregion
      return Response.json(
        {
          error: `Database unavailable: ${detail}`,
          code: "DB_ERROR",
          detail,
          errCode,
          cwd: process.cwd(),
          dataDir: process.env.DATA_DIR || null,
          rev: 3,
        },
        { status: 500 },
      );
    }

    if (!user || !compareSync(password, user.passwordHash)) {
      return jsonError("Invalid email or password", 401);
    }

    try {
      await saveLogin(user.id);
      // #region agent log
      dbg("session saved", { ok: true }, "A");
      // #endregion
    } catch (err) {
      // #region agent log
      dbg(
        "session save failed",
        { error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.name : null },
        "A",
      );
      // #endregion
      const msg = err instanceof Error ? err.message : String(err);
      const code = msg.includes("AUTH_SECRET") ? "AUTH_SECRET" : "SESSION_ERROR";
      return Response.json(
        {
          error: code === "AUTH_SECRET" ? "Server auth is misconfigured" : "Could not create session",
          code,
        },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, role: user.role });
  } catch (err) {
    // #region agent log
    dbg(
      "login unhandled",
      { error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.name : null },
      "C",
    );
    // #endregion
    return Response.json(
      {
        error: "Sign-in failed",
        code: "UNHANDLED",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
