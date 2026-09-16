"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { audioUrl, needsMp3Playback } from "@/lib/audio-format";
import { convertToMp3 } from "@/lib/ffmpeg-swarm";
import type { VersionDto } from "@/lib/types";

export type PlaybackClip = {
  id: string;
  url: string;
  converting: boolean;
  error: string;
};

function dbg(message: string, data: Record<string, unknown>, hypothesisId: string) {
  // #region agent log
  fetch("http://127.0.0.1:7320/ingest/c57f3afe-b42b-482a-a5e2-2a9d8d044626", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e65dec" },
    body: JSON.stringify({
      sessionId: "e65dec",
      runId: "playback-fix",
      hypothesisId,
      location: "useTrackPlayback.ts",
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => undefined);
  // #endregion
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function useTrackPlayback(
  trackId: string | undefined,
  versions: VersionDto[],
  shareToken?: string,
  preferredVersionId?: string,
) {
  const [clips, setClips] = useState<Record<string, PlaybackClip>>({});
  const createdRef = useRef<string[]>([]);
  const preparingRef = useRef(new Set<string>());
  const versionKey = versions.map((version) => `${version.id}:${version.playbackReady ? "1" : "0"}`).join("|");

  useEffect(() => {
    return () => {
      for (const url of createdRef.current) URL.revokeObjectURL(url);
      createdRef.current = [];
      preparingRef.current.clear();
      setClips({});
    };
  }, [trackId]);

  useEffect(() => {
    if (!trackId) return;
    let cancelled = false;
    const versionList = versions;

    // Always point WaveSurfer at the API play URL immediately.
    // /api/audio serves .play.mp3 when present, otherwise the original from Spaces/disk.
    // Do not block the waveform on browser ffmpeg.wasm (cPanel has no server ffmpeg).
    setClips((current) => {
      const next: Record<string, PlaybackClip> = {};
      for (const version of versionList) {
        const playable = audioUrl(version.id, shareToken);
        if (current[version.id]?.url?.startsWith("blob:")) {
          next[version.id] = current[version.id];
        } else {
          next[version.id] = {
            id: version.id,
            url: playable,
            // Never block the waveform on browser conversion — API/Spaces can play original.
            converting: false,
            error: "",
          };
        }
      }
      return next;
    });

    async function prepare(version: VersionDto) {
      if (version.playbackReady || !needsMp3Playback(version.originalFilename, version.mimeType)) return;
      if (preparingRef.current.has(version.id)) return;
      preparingRef.current.add(version.id);

      const playable = audioUrl(version.id, shareToken);
      try {
        // Prefer an already-uploaded playback object (or original WAV/FLAC on Spaces).
        const probe = await fetch(playable, { headers: { Range: "bytes=0-1" }, cache: "no-store" });
        dbg(
          "play probe",
          { versionId: version.id, status: probe.status, ok: probe.ok },
          "P1",
        );
        if (probe.ok || probe.status === 206) {
          if (!cancelled) {
            setClips((current) => ({
              ...current,
              [version.id]: { id: version.id, url: playable, converting: false, error: "" },
            }));
          }
          // If DB says not ready but file plays, still try to create an MP3 sidecar in the background.
        } else {
          dbg("play probe failed", { versionId: version.id, status: probe.status }, "P1");
        }

        const originalRes = await fetch(audioUrl(version.id, shareToken, "original"), { cache: "no-store" });
        if (!originalRes.ok) {
          const body = await originalRes.text().catch(() => "");
          dbg(
            "original fetch failed",
            { versionId: version.id, status: originalRes.status, body: body.slice(0, 300) },
            "P2",
          );
          throw new Error(
            body.includes("detail")
              ? (() => {
                  try {
                    return (JSON.parse(body) as { detail?: string; error?: string }).detail ||
                      (JSON.parse(body) as { error?: string }).error ||
                      "Could not load original audio";
                  } catch {
                    return "Could not load original audio";
                  }
                })()
              : "Could not load original audio",
          );
        }
        const blob = await originalRes.blob();
        dbg("original loaded", { versionId: version.id, bytes: blob.size }, "P2");

        const mp3 = await withTimeout(
          convertToMp3(blob, version.originalFilename),
          180_000,
          "MP3 conversion",
        );
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(mp3);
        createdRef.current.push(objectUrl);
        setClips((current) => ({
          ...current,
          [version.id]: { id: version.id, url: objectUrl, converting: false, error: "" },
        }));
        dbg("convert ok", { versionId: version.id, mp3Bytes: mp3.size }, "P3");

        const { spacesEnabled, uploadPlaybackSidecarToSpaces } = await import("@/lib/upload-client");
        if (await spacesEnabled()) {
          void uploadPlaybackSidecarToSpaces(version.id, mp3, shareToken);
        } else {
          const data = new FormData();
          data.set("file", mp3, mp3.name);
          if (shareToken) data.set("token", shareToken);
          void fetch(`/api/audio/${version.id}`, { method: "POST", body: data });
        }
      } catch (err) {
        preparingRef.current.delete(version.id);
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not convert to MP3";
        dbg("prepare failed", { versionId: version.id, error: message }, "P3");
        // Keep the API play URL if it already works; only clear when we have nothing.
        setClips((current) => {
          const existing = current[version.id];
          const keepUrl = existing?.url && !existing.url.startsWith("blob:") ? existing.url : playable;
          return {
            ...current,
            [version.id]: {
              id: version.id,
              url: keepUrl,
              converting: false,
              error: existing?.url ? "" : message,
            },
          };
        });
      }
    }

    const preferred = preferredVersionId || versionList.at(-1)?.id;
    const ordered = [...versionList].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    for (const version of ordered) void prepare(version);

    return () => {
      cancelled = true;
    };
    // versions is represented by versionKey so comment reloads don't retrigger conversion
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, versionKey, shareToken]);

  const list = useMemo(
    () =>
      versions.map(
        (version) =>
          clips[version.id] ?? {
            id: version.id,
            url: audioUrl(version.id, shareToken),
            converting: false,
            error: "",
          },
      ),
    [versions, clips, shareToken],
  );

  return {
    clips: list,
    converting: list.some((clip) => clip.converting),
  };
}
