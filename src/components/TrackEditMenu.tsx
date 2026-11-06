"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type VersionItem = {
  id: string;
  versionNumber: number;
};

type Props = {
  title: string;
  versions?: VersionItem[];
  canDelete?: boolean;
  deleteLabel?: string;
  onRename: (title: string) => Promise<void>;
  onDelete?: () => void;
  onDeleteVersion?: (versionId: string) => void;
};

export function TrackEditMenu({
  title,
  versions = [],
  canDelete,
  deleteLabel = "Move to trash",
  onRename,
  onDelete,
  onDeleteVersion,
}: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const canDeleteVersion = Boolean(onDeleteVersion) && versions.length > 1;

  useEffect(() => {
    setValue(title);
  }, [title]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function save() {
    const next = value.trim();
    if (next && next !== title) await onRename(next);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" data-no-activate>
      <button
        type="button"
        aria-label="Edit track"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((current) => !current);
        }}
        className="rounded-md p-1.5 text-mute hover:bg-surface-2 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
            <button
              type="button"
              aria-label="Close edit track"
              className="absolute inset-0 bg-black/70"
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Edit track"
              className="relative z-10 w-full max-w-sm space-y-3 rounded-xl border border-line bg-surface p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">Edit track</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-1 text-sm text-mute hover:text-ink"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <label className="type-section block">Title</label>
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void save();
                  }
                  if (e.key === "Escape") setOpen(false);
                }}
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brass"
              />
              <button
                type="button"
                onClick={() => void save()}
                className="type-ui w-full rounded-md bg-brass py-2 text-bg"
              >
                Save
              </button>
              {canDeleteVersion && (
                <div className="space-y-1 border-t border-line pt-3">
                  <p className="type-section">Versions</p>
                  <ul className="space-y-0.5">
                    {versions.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-2">
                        <span className="text-sm">v{item.versionNumber}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            onDeleteVersion?.(item.id);
                          }}
                          className="rounded-md px-1.5 py-1 text-xs text-rose-300 hover:bg-rose-950/40"
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {canDelete && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                  className="w-full rounded-md py-2 text-sm text-rose-300 hover:bg-rose-950/40"
                >
                  {deleteLabel}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
