"use client";

import { useEffect, useRef, useState } from "react";

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const canDeleteVersion = Boolean(onDeleteVersion) && versions.length > 1;

  useEffect(() => {
    setValue(title);
  }, [title]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function save() {
    const next = value.trim();
    if (next && next !== title) await onRename(next);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        aria-label="Edit track"
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
          setOpen((current) => !current);
        }}
        className="rounded-md p-1.5 text-mute hover:bg-surface-2 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed z-30 w-56 space-y-2 rounded-lg border border-line bg-surface p-3 shadow-xl"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          <label className="block text-[10px] font-medium tracking-wide text-mute uppercase">Title</label>
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
            className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm outline-none focus:border-brass"
          />
          <button
            type="button"
            onClick={() => void save()}
            className="w-full rounded-md bg-brass py-1.5 text-sm font-medium text-bg"
          >
            Save
          </button>
          {canDeleteVersion && (
            <div className="space-y-1 border-t border-line pt-2">
              <p className="text-[10px] font-medium tracking-wide text-mute uppercase">Versions</p>
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
              className="w-full rounded-md py-1.5 text-sm text-rose-300 hover:bg-rose-950/40"
            >
              {deleteLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
