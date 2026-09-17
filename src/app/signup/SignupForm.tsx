"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { appendPreparedAvatar } from "@/lib/avatar-client";

export function SignupForm() {
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
        try {
          const form = e.currentTarget;
          const data = new FormData(form);
          await appendPreparedAvatar(data, (form.elements.namedItem("photo") as HTMLInputElement).files?.[0]);
          const res = await fetch("/api/auth/signup", { method: "POST", body: data });
          const raw = await res.text();
          let json: { error?: string } = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch {
            json = { error: "Invalid server response" };
          }
          if (!res.ok) {
            setError(json.error ?? "Could not create account");
            return;
          }
          router.push("/projects");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not create account");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-1 text-sm">
        <span className="text-mute">Name</span>
        <input
          name="name"
          type="text"
          required
          autoComplete="name"
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>
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
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-mute">
          Profile photo <span className="text-mute/70">(optional)</span>
        </span>
        <input name="photo" type="file" accept="image/*" className="w-full text-xs text-mute" />
        <span className="block text-xs text-mute">Resized to a small square JPEG automatically.</span>
      </label>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button disabled={busy} className="w-full rounded-md bg-brass py-2.5 text-sm font-medium text-bg disabled:opacity-40">
        Create account
      </button>
    </form>
  );
}
