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

    setClips((current) => {
      const next: Record<string, PlaybackClip> = {};
      for (const version of versionList) {
        const ready = version.playbackReady || !needsMp3Playback(version.originalFilename, version.mimeType);
        next[version.id] = current[version.id]?.url
          ? current[version.id]
          : {
              id: version.id,
              url: ready ? audioUrl(version.id, shareToken) : "",
              converting: !ready,
              error: "",
            };
      }
      return next;
    });

    async function prepare(version: VersionDto) {
      if (version.playbackReady || !needsMp3Playback(version.originalFilename, version.mimeType)) return;
      if (preparingRef.current.has(version.id)) return;
      preparingRef.current.add(version.id);
      try {
        const res = await fetch(audioUrl(version.id, shareToken, "original"));
        if (!res.ok) throw new Error("Could not load original audio");
        const blob = await res.blob();
        const mp3 = await convertToMp3(blob, version.originalFilename);
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(mp3);
        createdRef.current.push(objectUrl);
        setClips((current) => ({
          ...current,
          [version.id]: { id: version.id, url: objectUrl, converting: false, error: "" },
        }));
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
        setClips((current) => ({
          ...current,
          [version.id]: {
            id: version.id,
            url: "",
            converting: false,
            error: err instanceof Error ? err.message : "Could not convert to MP3",
          },
        }));
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
            url: "",
            converting: !version.playbackReady && needsMp3Playback(version.originalFilename, version.mimeType),
            error: "",
          },
      ),
    [versions, clips],
  );

  return {
    clips: list,
    converting: list.some((clip) => clip.converting),
  };
}
