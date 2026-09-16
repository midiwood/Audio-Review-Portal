"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateProjectForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = e.currentTarget;
        const name = String(new FormData(form).get("name") ?? "").trim();
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const json = await res.json();
        setBusy(false);
        if (!res.ok) {
          setError(json.error ?? "Could not create project");
          return;
        }
        form.reset();
        router.push(`/projects/${json.project.id}`);
      }}
    >
      <input
        name="name"
        required
        placeholder="New project name"
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
      />
      <button disabled={busy} className="rounded-md bg-brass px-4 py-2 text-sm font-medium text-bg disabled:opacity-40">
        Create project
      </button>
      {error && <p className="w-full text-sm text-rose-300">{error}</p>}
    </form>
  );
}
