"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { VersionStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_SHORT } from "@/lib/status";
import { VERSION_STATUSES } from "@/lib/types";

export const STATUS_TONE: Record<VersionStatus, string> = {
  in_progress: "bg-zinc-800 text-zinc-300",
  review_requested: "bg-brass-dim text-brass",
  changes_requested: "bg-rose-950/60 text-rose-300",
  approved: "bg-emerald-950/60 text-emerald-300",
  rejected: "bg-zinc-800/80 text-zinc-500",
};

export function StatusBadge({ status, compact }: { status: VersionStatus; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full ${STATUS_TONE[status]} ${
        compact ? "type-ui px-1.5 py-0.5" : "type-ui px-2.5 py-0.5"
      }`}
    >
      {compact ? STATUS_SHORT[status] : STATUS_LABELS[status]}
    </span>
  );
}

export const STUDIO_STATUSES = [
  "review_requested",
  "changes_requested",
  "approved",
  "rejected",
] as const satisfies readonly VersionStatus[];

/** Track owners: approve delivery mix, mark needs changes, or reject. */
export const OWNER_STATUSES = ["changes_requested", "approved", "rejected"] as const satisfies readonly VersionStatus[];

export function StatusDropdown({
  status,
  onChange,
  disabled,
  options = VERSION_STATUSES,
  compact,
}: {
  status: VersionStatus;
  onChange: (status: VersionStatus) => void;
  disabled?: boolean;
  /** Statuses the actor may set. */
  options?: readonly VersionStatus[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const choices = options.includes(status) ? options : ([status, ...options] as VersionStatus[]);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setMenuStyle(null);
      return;
    }
    function place() {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = menuRef.current?.offsetHeight ?? 148;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight + 12;
      setMenuStyle({
        right: window.innerWidth - rect.right,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4, top: "auto" }
          : { top: rect.bottom + 4, bottom: "auto" }),
      });
    }
    place();
    requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, choices.length]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`relative shrink-0 ${compact ? "" : "w-36"}`} ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center justify-between gap-1 rounded-full whitespace-nowrap outline-none transition hover:brightness-110 disabled:opacity-50 ${
          STATUS_TONE[status]
        } ${compact ? "type-ui px-1.5 py-0.5" : "type-ui w-full gap-1.5 px-3 py-1.5"}`}
      >
        <span className="min-w-0 truncate text-left">{STATUS_SHORT[status]}</span>
        <svg viewBox="0 0 24 24" className={`shrink-0 fill-current opacity-70 ${compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"}`} aria-hidden>
          <path d="M7 10l5 5 5-5H7z" />
        </svg>
      </button>
      {open &&
        menuStyle &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            className="fixed z-[80] w-36 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
            style={menuStyle}
          >
            {choices.map((option) => (
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
          </ul>,
          document.body,
        )}
    </div>
  );
}
