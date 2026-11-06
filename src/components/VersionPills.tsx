"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VersionStatus } from "@/lib/types";

type VersionPill = {
  id: string;
  versionNumber: number;
  status: VersionStatus;
};

type Props = {
  versions: VersionPill[];
  /** Highlighted pill (only when the track row is selected). */
  selectedId?: string;
  /** Pill kept in view — the selected or default version. */
  focusId?: string;
  onSelect: (id: string) => void;
};

const FADE = "0.875rem";

function Arrow({ dir, enabled, onClick }: { dir: "left" | "right"; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-ink transition-colors hover:border-brass hover:bg-brass hover:text-bg disabled:pointer-events-none disabled:opacity-25"
      aria-label={dir === "left" ? "Earlier versions" : "Later versions"}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
        {dir === "left" ? <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" /> : <path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z" />}
      </svg>
    </button>
  );
}

export function VersionPills({ versions, selectedId, focusId, onSelect }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setOverflowing(el.scrollWidth > el.clientWidth + 1);
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateArrows();
    const observer = new ResizeObserver(updateArrows);
    observer.observe(el);
    el.addEventListener("scroll", updateArrows, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateArrows);
    };
  }, [updateArrows, versions.length]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const pill = focusId ? el.querySelector<HTMLElement>(`[data-version-id="${focusId}"]`) : null;
    if (!pill) {
      el.scrollLeft = el.scrollWidth;
    } else {
      // Scroll only the scroller horizontally — scrollIntoView would also move the page.
      const left = pill.offsetLeft;
      const right = left + pill.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
    }
    updateArrows();
  }, [focusId, versions.length, updateArrows]);

  function page(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.75, 40), behavior: "smooth" });
  }

  const mask = `linear-gradient(to right, ${canLeft ? "transparent" : "#000"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${
    canRight ? "transparent" : "#000"
  })`;

  return (
    <div className="flex min-w-0 items-center justify-center gap-1" data-no-activate>
      {overflowing && <Arrow dir="left" enabled={canLeft} onClick={() => page(-1)} />}
      <div
        ref={scrollerRef}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="relative flex min-w-0 snap-x items-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {versions.map((row) => {
          const verSelected = row.id === selectedId;
          const approved = row.status === "approved";
          const rejected = row.status === "rejected";
          return (
            <button
              key={row.id}
              data-version-id={row.id}
              type="button"
              onClick={() => onSelect(row.id)}
              className={`type-ui shrink-0 snap-start rounded-md px-2 py-1 tabular-nums ${
                approved
                  ? verSelected
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-950/40 text-emerald-400/90 hover:text-emerald-300"
                  : rejected
                    ? verSelected
                      ? "bg-zinc-600 text-zinc-200"
                      : "bg-zinc-900 text-zinc-500 hover:text-zinc-400"
                    : verSelected
                      ? "bg-brass text-bg"
                      : "bg-surface-2 text-mute hover:text-ink"
              }`}
            >
              v{row.versionNumber}
            </button>
          );
        })}
      </div>
      {overflowing && <Arrow dir="right" enabled={canRight} onClick={() => page(1)} />}
    </div>
  );
}
