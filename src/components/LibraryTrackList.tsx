"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { audioUrl } from "@/lib/audio-format";
import { formatTime } from "@/lib/format";
import type { LibraryTrackDto } from "@/lib/types";

export function LibraryTrackList({ tracks }: { tracks: LibraryTrackDto[] }) {
  const [query, setQuery] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (track) =>
        track.title.toLowerCase().includes(q) ||
        track.composerName.toLowerCase().includes(q) ||
        track.projectName.toLowerCase().includes(q),
    );
  }, [tracks, query]);

  function stopPlayback() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlayingId(null);
  }

  async function togglePlay(track: LibraryTrackDto) {
    if (!track.versionId) return;
    if (playingId === track.id) {
      stopPlayback();
      return;
    }
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audioRef.current = audio;
      audio.addEventListener("ended", () => setPlayingId(null));
    }
    audio.pause();
    audio.src = audioUrl(track.versionId);
    setPlayingId(track.id);
    try {
      await audio.play();
    } catch {
      setPlayingId(null);
    }
  }

  if (tracks.length === 0) {
    return (
      <p className="text-sm text-mute">
        No tracks yet.{" "}
        <Link href="/projects" className="text-brass hover:underline">
          Open a project
        </Link>{" "}
        to upload.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search title, composer, or project…"
        className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-brass"
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-mute">No matches.</p>
      ) : (
        <ul className="divide-y divide-line">
          {filtered.map((track) => {
            const isPlaying = playingId === track.id;
            return (
              <li key={track.id} className="group flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => void togglePlay(track)}
                  disabled={!track.versionId}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink hover:bg-brass hover:text-bg disabled:opacity-40"
                  aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                >
                  {isPlaying ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                      <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-current" aria-hidden>
                      <path d="M8 5.14v13.72L19 12 8 5.14Z" />
                    </svg>
                  )}
                </button>

                {track.composerAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.composerAvatarUrl}
                    alt=""
                    className="hidden h-9 w-9 shrink-0 rounded-full object-cover sm:block"
                  />
                ) : (
                  <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs text-ink sm:flex">
                    {track.composerName.slice(0, 1).toUpperCase()}
                  </span>
                )}

                <Link href={track.href} className="min-w-0 flex-1 hover:text-brass">
                  <p className="truncate text-sm font-medium text-ink group-hover:text-brass">{track.title}</p>
                  <p className="truncate text-xs text-mute">
                    {track.composerName}
                    <span className="text-mute/50"> · </span>
                    {track.projectName}
                    <span className="text-mute/50"> · </span>
                    v{track.versionNumber}
                    {track.unread ? <span className="text-brass"> · new</span> : null}
                  </p>
                </Link>

                <div className="hidden shrink-0 sm:block">
                  <StatusBadge status={track.status} compact />
                </div>

                <span className="w-10 shrink-0 text-right font-mono text-xs text-mute tabular-nums">
                  {track.durationSeconds != null ? formatTime(track.durationSeconds) : "—"}
                </span>

                <a
                  href={audioUrl(track.versionId, undefined, "download")}
                  download={track.originalFilename}
                  className="shrink-0 rounded-md p-2 text-mute hover:text-brass"
                  aria-label={`Download ${track.title}`}
                  title="Download"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
                    <path d="M12 3v10.2L8.4 9.6 7 11l5 5 5-5-1.4-1.4-3.6 3.6V3h-2Zm-7 16v2h14v-2H5Z" />
                  </svg>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
