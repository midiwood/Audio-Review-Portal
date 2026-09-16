"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinForm({ token, projectName }: { token: string; projectName: string }) {
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
        const form = e.currentTarget;
        const data = new FormData(form);
        data.set("token", token);
        const res = await fetch("/api/auth/join", { method: "POST", body: data });
        const json = await res.json();
        setBusy(false);
        if (!res.ok) {
          setError(json.error ?? "Could not join");
          return;
        }
        router.push(`/projects/${json.projectId}`);
        router.refresh();
      }}
    >
      <p className="text-sm text-mute">
        You&apos;re joining <span className="text-ink">{projectName}</span>. Create your composer account, or sign in
        with an existing one.
      </p>
      <label className="block space-y-1 text-sm">
        <span className="text-mute">Name</span>
        <input name="name" className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass" />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-mute">Email</span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-mute">Password</span>
        <input
          name="password"
          type="password"
          required
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-mute">Profile photo</span>
        <input name="photo" type="file" accept="image/*" className="w-full text-xs text-mute" />
      </label>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button disabled={busy} className="w-full rounded-md bg-brass py-2.5 text-sm font-medium text-bg disabled:opacity-40">
        Join project
      </button>
    </form>
  );
}
