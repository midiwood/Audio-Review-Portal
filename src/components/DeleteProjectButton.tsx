"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Move project “${projectName}” to trash?`)) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Could not move project to trash");
      return;
    }
    router.push("/projects");
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void remove()}
      className="rounded-md border border-line px-3 py-1.5 text-sm text-mute hover:border-rose-400 hover:text-rose-300 disabled:opacity-40"
    >
      Delete
    </button>
  );
}
