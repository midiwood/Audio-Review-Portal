"use client";

import { parseAppleMusicSong } from "@/lib/apple-music";
import type { ReferenceDto } from "@/lib/types";

type Props = {
  references: ReferenceDto[];
  canEdit?: boolean;
  onAdd?: (url: string, title: string) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
};

export function ReferenceList({ references, canEdit, onAdd, onRemove }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium tracking-wide text-mute uppercase">Reference</h2>
      <div className="space-y-3">
        {references.map((ref) => {
          const song = parseAppleMusicSong(ref.url);
          return (
            <article key={ref.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex items-center gap-2 px-3 py-2">
                <p className="min-w-0 flex-1 truncate text-sm text-ink">{ref.title || song?.title || "Apple Music"}</p>
                <a
                  href={song?.openUrl ?? ref.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-md p-1 text-brass hover:bg-surface-2"
                  aria-label="Open in Apple Music"
                  title="Open in Apple Music"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                    <path d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H7v10h10v-4h2v6H5V5Z" />
                  </svg>
                </a>
                {canEdit && onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(ref.id)}
                    className="shrink-0 rounded-md px-1.5 py-1 text-mute hover:text-rose-300"
                    aria-label="Remove reference"
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </div>
              {song && (
                <iframe
                  title={ref.title || song.title}
                  allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                  frameBorder={0}
                  height={152}
                  className="w-full bg-transparent"
                  sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
                  src={song.embedUrl}
                />
              )}
            </article>
          );
        })}
      </div>
      {canEdit && onAdd && (
        <form
          className="flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            const url = String(data.get("url") ?? "").trim();
            if (!url) return;
            await onAdd(url, "");
            form.reset();
          }}
        >
          <input
            name="url"
            placeholder="Apple Music link…"
            className="min-w-0 flex-1 rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brass"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm leading-none hover:border-brass"
            aria-label="Add reference"
            title="Add"
          >
            +
          </button>
        </form>
      )}
    </section>
  );
}
