"use client";

import type { DeliveryDto } from "@/lib/types";

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 3v10.2L8.4 9.6 7 11l5 5 5-5-1.4-1.4-3.6 3.6V3h-2Zm-7 16v2h14v-2H5Z" />
    </svg>
  );
}

type Props = {
  deliveries: DeliveryDto[];
  /** Preview / mp3 download for the current version. */
  previewHref?: string;
  previewFilename?: string;
  /** Show Finals & Stems expand control (upload and/or existing files). */
  showDeliveries?: boolean;
  deliveriesOpen?: boolean;
  onToggleDeliveries?: () => void;
};

/** Preview MP3 icon + Finals & Stems expand button. */
export function TrackDownloadControls({
  deliveries,
  previewHref,
  previewFilename,
  showDeliveries = false,
  deliveriesOpen = false,
  onToggleDeliveries,
}: Props) {
  const hasDeliveries = deliveries.length > 0;
  if (!previewHref && !showDeliveries) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5" data-no-activate>
      {previewHref && (
        <a
          href={previewHref}
          download={previewFilename}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-mute hover:bg-surface-2 hover:text-brass"
          title="Download preview (MP3)"
          aria-label="Download preview MP3"
          onClick={(e) => e.stopPropagation()}
        >
          <DownloadIcon className="h-3 w-3" />
        </a>
      )}

      {showDeliveries && onToggleDeliveries && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDeliveries();
          }}
          className={`type-ui inline-flex h-6 items-center gap-1 rounded px-1.5 transition ${
            deliveriesOpen
              ? "bg-brass-dim text-brass"
              : "text-mute hover:bg-surface-2 hover:text-ink"
          }`}
          aria-expanded={deliveriesOpen}
          title="Finals & stems"
        >
          <span className="hidden sm:inline">Finals & stems</span>
          <span className="sm:hidden">{hasDeliveries ? "Files" : "F&S"}</span>
          <svg
            viewBox="0 0 24 24"
            className={`h-2.5 w-2.5 fill-current opacity-70 transition-transform ${deliveriesOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            <path d="M7 10l5 5 5-5H7z" />
          </svg>
        </button>
      )}
    </div>
  );
}
