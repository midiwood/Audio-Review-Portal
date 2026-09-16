"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectListItem } from "@/lib/types";
import { formatDate } from "@/lib/format";

export function ProjectTrash({ projects }: { projects: ProjectListItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (projects.length === 0) return null;

  async function restore(id: string) {
    setBusy(true);
    const res = await fetch(`/api/projects/${id}/restore`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Could not restore project");
      return;
    }
    router.refresh();
  }

  async function purge(id: string, name: string) {
    if (!confirm(`Permanently delete “${name}”? This cannot be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${id}/purge`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Could not delete project");
      return;
    }
    router.refresh();
  }

  async function emptyTrash() {
    if (
      !confirm(
        `Permanently delete ${projects.length} project${projects.length === 1 ? "" : "s"} from trash? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch("/api/projects/trash", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Could not empty trash");
      return;
    }
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium tracking-wide text-mute uppercase">Trash</h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => void emptyTrash()}
          className="rounded-md px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
        >
          Empty trash
        </button>
      </div>
      <ul className="space-y-2">
        {projects.map((project) => (
          <li
            key={project.id}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-mute">{project.name}</p>
              <p className="text-xs text-mute">
                {project.trackCount} track{project.trackCount === 1 ? "" : "s"} · {formatDate(project.createdAt)}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void restore(project.id)}
              className="shrink-0 rounded-md px-2.5 py-1.5 text-xs text-brass hover:bg-surface-2 disabled:opacity-50"
            >
              Restore
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Permanently delete ${project.name}`}
              onClick={() => void purge(project.id, project.name)}
              className="shrink-0 rounded-md p-1.5 text-mute hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
