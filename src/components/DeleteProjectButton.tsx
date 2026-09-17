"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function DeleteProjectButton({
  projectId,
  projectName,
  variant = "menu",
}: {
  projectId: string;
  projectName: string;
  /** menu = hover ⋯ on list rows; button = compact text (overflow menus) */
  variant?: "menu" | "button";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function remove() {
    if (!confirm(`Move project “${projectName}” to trash?`)) return;
    setBusy(true);
    setOpen(false);
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

  if (variant === "button") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className="w-full rounded-md px-3 py-1.5 text-left text-sm text-rose-300 hover:bg-rose-950/40 disabled:opacity-40"
      >
        Delete project
      </button>
    );
  }

  return (
    <div className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" ref={wrapRef}>
      <button
        type="button"
        disabled={busy}
        aria-label={`Options for ${projectName}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((current) => !current);
        }}
        className="rounded-md p-1.5 text-mute hover:bg-surface-2 hover:text-ink disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 z-20 mt-1 min-w-[9rem] rounded-lg border border-line bg-surface py-1 shadow-xl">
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="w-full px-3 py-1.5 text-left text-sm text-rose-300 hover:bg-rose-950/40 disabled:opacity-40"
          >
            Move to trash
          </button>
        </div>
      )}
    </div>
  );
}
