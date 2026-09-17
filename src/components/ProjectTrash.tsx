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
    <details className="group border-t border-line pt-4">
      <summary className="cursor-pointer list-none text-sm text-mute hover:text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-mute/70 group-open:rotate-90 transition-transform">▸</span>
          Trash ({projects.length})
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void emptyTrash()}
            className="text-xs text-rose-300/90 hover:text-rose-200 disabled:opacity-50"
          >
            Empty trash
          </button>
        </div>
        <ul className="divide-y divide-line">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-mute">{project.name}</p>
                <p className="text-xs text-mute/70">
                  {project.trackCount} track{project.trackCount === 1 ? "" : "s"} · {formatDate(project.createdAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void restore(project.id)}
                className="shrink-0 px-2 py-1 text-xs text-brass hover:text-ink disabled:opacity-50"
              >
                Restore
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={`Permanently delete ${project.name}`}
                onClick={() => void purge(project.id, project.name)}
                className="shrink-0 rounded-md p-1.5 text-mute hover:text-rose-300 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
