"use client";

import { useState } from "react";
import { parseAppleMusicSong } from "@/lib/apple-music";
import type { ReferenceDto } from "@/lib/types";

/** Official compact Apple Music song embed height. */
const EMBED_HEIGHT = 150;

type Props = {
  references: ReferenceDto[];
  canEdit?: boolean;
  onAdd?: (url: string, title: string) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
};

/** Compact Apple Music song embeds (smallest official player size). */
export function ReferenceList({ references, canEdit, onAdd, onRemove }: Props) {
  const [adding, setAdding] = useState(false);

  if (references.length === 0 && !canEdit) return null;

  return (
    <div className="space-y-1.5">
      {references.map((ref) => {
        const song = parseAppleMusicSong(ref.url);
        const label = ref.title || song?.title || "Apple Music";
        const href = song?.openUrl ?? ref.url;
        return (
          <div key={ref.id} className="group relative overflow-hidden rounded-md">
            {song ? (
              <iframe
                title={label}
                allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                frameBorder={0}
                height={EMBED_HEIGHT}
                className="w-full max-w-full bg-transparent"
                style={{ overflow: "hidden", background: "transparent" }}
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
                src={song.embedUrl}
              />
            ) : (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="block truncate rounded-md border border-line px-2 py-1.5 type-ui text-brass hover:underline"
              >
                {label}
              </a>
            )}
            <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-bg/80 px-1.5 py-0.5 type-ui text-brass backdrop-blur-sm hover:text-ink"
              >
                Open
              </a>
              {canEdit && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(ref.id)}
                  className="rounded bg-bg/80 px-1 py-0.5 type-ui text-mute backdrop-blur-sm hover:text-rose-300"
                  aria-label={`Remove ${label}`}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        );
      })}

      {canEdit && onAdd && (
        adding ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              const url = String(data.get("url") ?? "").trim();
              if (!url) return;
              await onAdd(url, "");
              form.reset();
              setAdding(false);
            }}
          >
            <input
              name="url"
              autoFocus
              placeholder="Paste Apple Music link…"
              className="min-w-0 flex-1 rounded border border-line bg-bg type-ui px-2 py-1 outline-none focus:border-brass"
            />
            <button type="submit" className="shrink-0 type-ui text-brass hover:underline">
              Add
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="type-ui shrink-0 text-mute hover:text-ink"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="type-ui text-mute hover:text-brass"
          >
            + Apple Music ref
          </button>
        )
      )}
    </div>
  );
}
