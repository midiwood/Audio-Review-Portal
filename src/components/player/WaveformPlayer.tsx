"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { formatTime } from "@/lib/format";
import type { CommentDto } from "@/lib/types";

export type PlayerClip = {
  id: string;
  url: string;
  converting?: boolean;
  error?: string;
  comments: CommentDto[];
};

type Props = {
  clips: PlayerClip[];
  activeId: string;
  onTime: (seconds: number) => void;
  seekTo?: number | null;
  seekNonce?: number;
  startAt?: number;
  autoplay?: boolean;
  onPlaying?: (playing: boolean) => void;
  onDuration?: (seconds: number) => void;
  onJumpToComment?: (seconds: number) => void;
};

type Slot = {
  ws: WaveSurfer;
  url: string;
  ready: boolean;
};

export function WaveformPlayer({
  clips,
  activeId,
  onTime,
  seekTo,
  seekNonce,
  startAt = 0,
  autoplay = false,
  onPlaying,
  onDuration,
  onJumpToComment,
}: Props) {
  const paneRefs = useRef(new Map<string, HTMLDivElement>());
  const slotsRef = useRef(new Map<string, Slot>());
  const activeIdRef = useRef(activeId);
  const onTimeRef = useRef(onTime);
  const onDurationRef = useRef(onDuration);
  const onPlayingRef = useRef(onPlaying);
  const playheadRef = useRef(startAt);
  const autoplayRef = useRef(autoplay);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(startAt);
  const [duration, setDuration] = useState(0);

  onTimeRef.current = onTime;
  onDurationRef.current = onDuration;
  onPlayingRef.current = onPlaying;
  autoplayRef.current = autoplay;
  activeIdRef.current = activeId;
  playheadRef.current = current;

  const activeClip = clips.find((clip) => clip.id === activeId) ?? clips[0];

  useLayoutEffect(() => {
    const slots = slotsRef.current;
    const ids = new Set(clips.map((clip) => clip.id));

    for (const [id, slot] of slots) {
      if (!ids.has(id)) {
        slot.ws.destroy();
        slots.delete(id);
      }
    }

    for (const clip of clips) {
      if (!clip.url) continue;
      const pane = paneRefs.current.get(clip.id);
      if (!pane) continue;
      const existing = slots.get(clip.id);
      if (existing) {
        if (existing.url !== clip.url) {
          existing.url = clip.url;
          existing.ready = false;
          void existing.ws.load(clip.url);
        }
        continue;
      }

      const ws = WaveSurfer.create({
        container: pane,
        url: clip.url,
        height: 112,
        barWidth: 2,
        barGap: 1.5,
        barRadius: 2,
        cursorWidth: 2,
        waveColor: "#3f3f46",
        progressColor: "#d4a054",
        cursorColor: "#f3f1ec",
        normalize: false,
        backend: "MediaElement",
        interact: true,
        dragToSeek: true,
      });
      const slot: Slot = { ws, url: clip.url, ready: false };
      slots.set(clip.id, slot);

      ws.on("ready", () => {
        slot.ready = true;
        if (activeIdRef.current !== clip.id) return;
        const d = ws.getDuration();
        const t = Math.min(Math.max(playheadRef.current, 0), d || 0);
        if (t > 0) ws.setTime(t);
        setDuration(d);
        setCurrent(t);
        setReady(true);
        onTimeRef.current(t);
        onDurationRef.current?.(d);
        if (autoplayRef.current) void ws.play();
      });
      ws.on("error", () => {
        if (activeIdRef.current !== clip.id) return;
        setReady(false);
      });
      ws.on("audioprocess", () => {
        if (activeIdRef.current !== clip.id) return;
        const t = ws.getCurrentTime();
        setCurrent(t);
        playheadRef.current = t;
        onTimeRef.current(t);
      });
      ws.on("seeking", () => {
        if (activeIdRef.current !== clip.id) return;
        const t = ws.getCurrentTime();
        setCurrent(t);
        playheadRef.current = t;
        onTimeRef.current(t);
      });
      ws.on("play", () => {
        if (activeIdRef.current !== clip.id) return;
        setPlaying(true);
        onPlayingRef.current?.(true);
      });
      ws.on("pause", () => {
        if (activeIdRef.current !== clip.id) return;
        setPlaying(false);
        onPlayingRef.current?.(false);
      });
      ws.on("finish", () => {
        if (activeIdRef.current !== clip.id) return;
        setPlaying(false);
        onPlayingRef.current?.(false);
      });
    }
  }, [clips]);

  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current.values()) slot.ws.destroy();
      slotsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const slots = slotsRef.current;
    for (const [id, slot] of slots) {
      if (id !== activeId && slot.ws.isPlaying()) slot.ws.pause();
    }
    const next = slots.get(activeId);
    if (!next?.ready) {
      setReady(false);
      return;
    }
    const d = next.ws.getDuration();
    const t = Math.min(Math.max(playheadRef.current, 0), d || 0);
    next.ws.setTime(t);
    setDuration(d);
    setCurrent(t);
    setReady(true);
    onTimeRef.current(t);
    onDurationRef.current?.(d);
    if (autoplayRef.current) void next.ws.play();
  }, [activeId]);

  useEffect(() => {
    if (seekTo == null) return;
    const slot = slotsRef.current.get(activeId);
    if (!slot?.ready) return;
    slot.ws.setTime(seekTo);
    setCurrent(seekTo);
    playheadRef.current = seekTo;
    onTimeRef.current(seekTo);
  }, [seekTo, seekNonce, activeId, ready]);

  function activeSlot() {
    return slotsRef.current.get(activeId);
  }

  function skip(delta: number) {
    const slot = activeSlot();
    if (!slot?.ready) return;
    const next = Math.min(Math.max(slot.ws.getCurrentTime() + delta, 0), slot.ws.getDuration() || 0);
    slot.ws.setTime(next);
    setCurrent(next);
    playheadRef.current = next;
    onTimeRef.current(next);
  }

  function toggle() {
    activeSlot()?.ws.playPause();
  }

  const skipRef = useRef(skip);
  const toggleRef = useRef(toggle);
  skipRef.current = skip;
  toggleRef.current = toggle;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        skipRef.current(-10);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        skipRef.current(10);
      } else if (e.key === " ") {
        e.preventDefault();
        toggleRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const overlay = !ready
    ? activeClip?.error ||
      (activeClip?.url
        ? "Loading waveform…"
        : activeClip?.converting
          ? "Converting to MP3…"
          : "Preparing audio…")
    : "";

  return (
    <div className="space-y-3">
      <div className="relative touch-none">
        <div className="relative h-[112px] overflow-hidden rounded-lg bg-surface-2 touch-none">
          {clips.map((clip) => (
            <div
              key={clip.id}
              ref={(node) => {
                if (node) paneRefs.current.set(clip.id, node);
                else paneRefs.current.delete(clip.id);
              }}
              className={`wave-wrap absolute inset-0 touch-none ${clip.id === activeId ? "z-10" : "pointer-events-none invisible"}`}
            />
          ))}
        </div>
        {overlay && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 text-center text-sm text-mute">
            {overlay}
          </div>
        )}
        {ready && duration > 0 && (
          <div className="absolute inset-x-0 bottom-0 z-20 h-4">
            {(activeClip?.comments ?? []).map((comment) => (
              <button
                key={comment.id}
                type="button"
                title={comment.body.slice(0, 80) || "Jump to comment"}
                aria-label={`Jump to comment at ${formatTime(comment.timestampSeconds)}`}
                onClick={() => {
                  const t = comment.timestampSeconds;
                  const slot = slotsRef.current.get(activeId);
                  if (slot?.ready) {
                    slot.ws.setTime(t);
                    setCurrent(t);
                    playheadRef.current = t;
                    onTimeRef.current(t);
                  }
                  onJumpToComment?.(t);
                }}
                className="absolute bottom-1 h-3 w-1.5 -translate-x-1/2 rounded-full bg-brass hover:brightness-125"
                style={{ left: `${(comment.timestampSeconds / duration) * 100}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6">
        <p className="w-12 text-right font-mono text-xs text-mute">{formatTime(current)}</p>
        <button
          type="button"
          onClick={() => skip(-10)}
          className="flex h-12 w-12 flex-col items-center justify-center rounded-full text-ink hover:text-brass"
          aria-label="Skip back 10 seconds"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
            <path d="M11 18V6l-8.5 6 8.5 6Zm.5-6 8.5 6V6l-8.5 6Z" />
          </svg>
          <span className="text-[10px] font-medium leading-none">10</span>
        </button>
        <button
          type="button"
          onClick={toggle}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-brass text-bg shadow-lg hover:brightness-110"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
              <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-8 w-8 fill-current" aria-hidden>
              <path d="M8 5.14v13.72L19 12 8 5.14Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => skip(10)}
          className="flex h-12 w-12 flex-col items-center justify-center rounded-full text-ink hover:text-brass"
          aria-label="Skip forward 10 seconds"
        >
          <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
            <path d="M13 6v12l8.5-6L13 6ZM12.5 12 4 18V6l8.5 6Z" />
          </svg>
          <span className="text-[10px] font-medium leading-none">10</span>
        </button>
        <p className="w-12 font-mono text-xs text-mute">{formatTime(duration)}</p>
      </div>
    </div>
  );
}
