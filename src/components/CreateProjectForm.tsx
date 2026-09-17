"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateProjectForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="flex flex-wrap items-center gap-2"
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
        placeholder="New project"
        className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-brass"
      />
      <button disabled={busy} className="rounded-md bg-brass px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-40">
        Create
      </button>
      {error && <p className="w-full text-sm text-rose-300">{error}</p>}
    </form>
  );
}
