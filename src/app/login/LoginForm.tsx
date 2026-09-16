"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const data = new FormData(e.currentTarget);
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: data.get("email"),
            password: data.get("password"),
          }),
        });
        const raw = await res.text();
        // #region agent log
        fetch("http://127.0.0.1:7320/ingest/c57f3afe-b42b-482a-a5e2-2a9d8d044626", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e65dec" },
          body: JSON.stringify({
            sessionId: "e65dec",
            runId: "live-login",
            hypothesisId: "D",
            location: "LoginForm.tsx:onSubmit",
            message: "login response",
            data: {
              status: res.status,
              ok: res.ok,
              bodyPreview: raw.slice(0, 500),
              host: typeof window !== "undefined" ? window.location.host : null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => undefined);
        // #endregion
        let json: { error?: string; code?: string; ok?: boolean } = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch {
          json = { error: "Invalid server response" };
        }
        setBusy(false);
        if (!res.ok) {
          setError(
            json.code === "DB_ERROR" && "detail" in json && typeof (json as { detail?: string }).detail === "string"
              ? `Database unavailable: ${(json as { detail: string }).detail}`
              : (json.error ?? "Could not sign in"),
          );
          return;
        }
        router.push("/projects");
        router.refresh();
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="text-mute">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-mute">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button disabled={busy} className="w-full rounded-md bg-brass py-2.5 text-sm font-medium text-bg disabled:opacity-40">
        Sign in
      </button>
    </form>
  );
}
