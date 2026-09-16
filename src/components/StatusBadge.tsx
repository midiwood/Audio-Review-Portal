"use client";

import { useEffect, useRef, useState } from "react";
import type { VersionStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_SHORT } from "@/lib/status";
import { VERSION_STATUSES } from "@/lib/types";

export const STATUS_TONE: Record<VersionStatus, string> = {
  in_progress: "bg-zinc-800 text-zinc-300",
  review_requested: "bg-brass-dim text-brass",
  changes_requested: "bg-rose-950/60 text-rose-300",
  approved: "bg-emerald-950/60 text-emerald-300",
};

export function StatusBadge({ status, compact }: { status: VersionStatus; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full font-medium ${STATUS_TONE[status]} ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      {compact ? STATUS_SHORT[status] : STATUS_LABELS[status]}
    </span>
  );
}

export function StatusDropdown({
  status,
  onChange,
  disabled,
}: {
  status: VersionStatus;
  onChange: (status: VersionStatus) => void;
  disabled?: boolean;
}) {
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

  return (
    <div className="relative w-32 shrink-0" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap outline-none transition hover:brightness-110 disabled:opacity-50 ${STATUS_TONE[status]}`}
      >
        <span className="min-w-0 flex-1 truncate text-left">{STATUS_SHORT[status]}</span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-current opacity-70" aria-hidden>
          <path d="M7 10l5 5 5-5H7z" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-full right-0 z-30 mt-1 w-32 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          {VERSION_STATUSES.map((option) => (
            <li key={option} role="option" aria-selected={option === status}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (option !== status) onChange(option);
                }}
                className={`flex w-full px-2 py-1.5 text-left text-xs hover:bg-surface-2 ${
                  option === status ? "bg-surface-2" : ""
                }`}
              >
                <span
                  className={`inline-flex w-full justify-center rounded-full px-2.5 py-1 font-medium whitespace-nowrap ${STATUS_TONE[option]}`}
                >
                  {STATUS_SHORT[option]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
