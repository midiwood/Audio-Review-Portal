"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import type { DeliveryDto, DeliveryKind } from "@/lib/types";

type Props = {
  trackId: string;
  deliveries: DeliveryDto[];
  canUpload: boolean;
  canDownloadZip?: boolean;
  busy?: boolean;
  onUpload: (kind: DeliveryKind, files: File[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 3v10.2L8.4 9.6 7 11l5 5 5-5-1.4-1.4-3.6 3.6V3h-2Zm-7 16v2h14v-2H5Z" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11 16V7.8L8.4 10.4 7 9l5-5 5 5-1.4 1.4L13 7.8V16h-2Zm-6 3v2h14v-2H5Z" />
    </svg>
  );
}

function DeliveryRow({
  item,
  canUpload,
  onDelete,
}: {
  item: DeliveryDto;
  canUpload: boolean;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <li className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm" title={item.originalFilename}>
        {item.originalFilename}
      </span>
      <a
        href={`/api/deliveries/${item.id}`}
        download={item.originalFilename}
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-brass p-1.5 text-bg hover:brightness-110"
        aria-label={`Download ${item.originalFilename}`}
        title="Download"
      >
        <DownloadIcon className="h-3.5 w-3.5" />
      </a>
      {canUpload && (
        <button
          type="button"
          onClick={() => void onDelete(item.id)}
          className="shrink-0 rounded-md px-1.5 py-1 text-mute hover:text-rose-300"
          aria-label={`Remove ${item.originalFilename}`}
          title="Remove"
        >
          ×
        </button>
      )}
    </li>
  );
}

function DropTile({
  label,
  disabled,
  onFiles,
  inputRef,
  accept,
}: {
  label: string;
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
}) {
  const [dragging, setDragging] = useState(false);

  function onDragEnter(e: DragEvent) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }
  function onDragLeave(e: DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragging(false);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-4 text-mute transition-colors disabled:opacity-40 ${
          dragging ? "border-brass bg-brass-dim text-brass" : "border-line bg-surface hover:border-brass hover:text-ink"
        }`}
        aria-label={`Drop or choose ${label.toLowerCase()}`}
      >
        <UploadIcon className="h-4 w-4" />
        <span className="text-[10px] font-medium tracking-wide uppercase">{label}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function FileGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium tracking-wide text-mute uppercase">{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

export function DeliveryPanel({ trackId, deliveries, canUpload, canDownloadZip, busy, onUpload, onDelete }: Props) {
  const finalRef = useRef<HTMLInputElement>(null);
  const stemRef = useRef<HTMLInputElement>(null);
  const [zipping, setZipping] = useState(false);
  const finals = deliveries.filter((item) => item.kind === "final");
  const stems = deliveries.filter((item) => item.kind === "stem");

  function pick(kind: DeliveryKind, files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (list.length) void onUpload(kind, list);
  }

  async function downloadAll() {
    setZipping(true);
    try {
      const res = await fetch(`/api/tracks/${trackId}/deliveries/zip`);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Could not download zip");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? "finals-stems.zip";
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not download zip");
    } finally {
      setZipping(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium tracking-wide text-mute uppercase">Finals & stems</h3>
        {canDownloadZip && deliveries.length > 0 && (
          <button
            type="button"
            disabled={zipping || busy}
            onClick={() => void downloadAll()}
            className="inline-flex items-center gap-1 rounded-md bg-brass px-2 py-1 text-xs font-medium text-bg hover:brightness-110 disabled:opacity-40"
            title={zipping ? "Zipping…" : "Download all"}
            aria-label={zipping ? "Zipping" : "Download all"}
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            {zipping ? "…" : "All"}
          </button>
        )}
      </div>

      {canUpload && (
        <div className="grid grid-cols-2 gap-2">
          <DropTile
            label="Final"
            disabled={busy}
            inputRef={finalRef}
            accept="audio/*,.zip"
            onFiles={(files) => pick("final", files)}
          />
          <DropTile
            label="Stems"
            disabled={busy}
            inputRef={stemRef}
            accept="audio/*,.zip"
            onFiles={(files) => pick("stem", files)}
          />
        </div>
      )}

      {deliveries.length === 0 && !canUpload && <p className="text-xs text-mute">None yet.</p>}

      {deliveries.length > 0 && (
        <div className="space-y-3">
          {finals.length > 0 && (
            <FileGroup title="Finals">
              {finals.map((item) => (
                <DeliveryRow key={item.id} item={item} canUpload={canUpload} onDelete={onDelete} />
              ))}
            </FileGroup>
          )}
          {stems.length > 0 && (
            <FileGroup title="Stems">
              {stems.map((item) => (
                <DeliveryRow key={item.id} item={item} canUpload={canUpload} onDelete={onDelete} />
              ))}
            </FileGroup>
          )}
        </div>
      )}
    </section>
  );
}
