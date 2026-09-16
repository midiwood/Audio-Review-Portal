"use client";

import { useRef, useState } from "react";
import { titleFromFilename } from "@/lib/format";

type VersionTarget = { id: string; title: string };

export type DroppedUploadItem =
  | { file: File; kind: "new"; title: string }
  | { file: File; kind: "version"; trackId: string };

type Pending = {
  id: string;
  file: File;
  title: string;
  mode: "new" | "version";
  trackId: string;
};

type Props = {
  disabled?: boolean;
  versionTargets?: VersionTarget[];
  /** Pre-select this track for "new version" rows when eligible. */
  defaultVersionTrackId?: string;
  onUpload: (items: DroppedUploadItem[]) => Promise<void>;
};

function isAudioFile(file: File) {
  return file.type.startsWith("audio/") || /\.(mp3|wav|flac|aac|m4a|ogg|aiff|aif)$/i.test(file.name);
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11 16V7.8L8.4 10.4 7 9l5-5 5 5-1.4 1.4L13 7.8V16h-2Zm-6 3v2h14v-2H5Z" />
    </svg>
  );
}

export function TrackDropZone({ disabled, versionTargets = [], defaultVersionTrackId, onUpload }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const canVersion = versionTargets.length > 0;
  const defaultTrackId =
    defaultVersionTrackId && versionTargets.some((t) => t.id === defaultVersionTrackId)
      ? defaultVersionTrackId
      : (versionTargets[0]?.id ?? "");

  function addFiles(files: FileList | File[]) {
    const audio = Array.from(files).filter(isAudioFile);
    if (audio.length === 0) return;
    setPending((current) => [
      ...current,
      ...audio.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        title: titleFromFilename(file.name),
        mode: "new" as const,
        trackId: defaultTrackId,
      })),
    ]);
  }

  async function upload() {
    if (pending.length === 0 || disabled) return;
    const items: DroppedUploadItem[] = pending.map((item) => {
      if (item.mode === "version" && item.trackId) {
        return { file: item.file, kind: "version", trackId: item.trackId };
      }
      return {
        file: item.file,
        kind: "new",
        title: item.title.trim() || titleFromFilename(item.file.name),
      };
    });
    await onUpload(items);
    setPending([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 py-5 transition-colors disabled:opacity-40 ${
          dragging ? "border-brass bg-brass-dim text-brass" : "border-line bg-surface text-mute hover:border-brass hover:text-ink"
        }`}
        aria-label="Drop audio or choose files"
      >
        <UploadIcon className="h-5 w-5" />
        <span className="text-[10px] font-medium tracking-wide uppercase">Drop audio</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {pending.length > 0 && (
        <ul className="space-y-2">
          {pending.map((item) => (
            <li key={item.id} className="space-y-1 rounded-md border border-line bg-bg p-1.5">
              <div className="flex items-center gap-1">
                {canVersion && (
                  <select
                    value={item.mode === "version" ? item.trackId : "new"}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPending((current) =>
                        current.map((row) =>
                          row.id === item.id
                            ? value === "new"
                              ? { ...row, mode: "new" }
                              : { ...row, mode: "version", trackId: value }
                            : row,
                        ),
                      );
                    }}
                    className="max-w-[42%] shrink-0 truncate rounded-md border border-line bg-surface px-1.5 py-1 text-[11px] outline-none focus:border-brass"
                    aria-label="New track or version of"
                  >
                    <option value="new">New track</option>
                    {versionTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        v+ {target.title}
                      </option>
                    ))}
                  </select>
                )}
                {item.mode === "new" ? (
                  <input
                    value={item.title}
                    onChange={(e) =>
                      setPending((current) =>
                        current.map((row) => (row.id === item.id ? { ...row, title: e.target.value } : row)),
                      )
                    }
                    className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-brass"
                    aria-label="Track title"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate px-1 text-xs text-mute" title={item.file.name}>
                    {item.file.name}
                  </span>
                )}
                <button
                  type="button"
                  className="shrink-0 rounded-md px-1.5 py-1 text-mute hover:text-rose-300"
                  onClick={() => setPending((current) => current.filter((row) => row.id !== item.id))}
                  aria-label={`Remove ${item.file.name}`}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => void upload()}
          className="w-full rounded-md bg-brass py-1.5 text-sm font-medium text-bg disabled:opacity-40"
        >
          Upload {pending.length}
        </button>
      )}
    </div>
  );
}
