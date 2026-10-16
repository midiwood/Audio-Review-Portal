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
  /** Inline row waveform — no transport chrome (play lives on the track row). */
  compact?: boolean;
  /** Single-line footer wave — shorter than compact. */
  inline?: boolean;
  /**
   * When false, waveform is visual-only: no playback, no keyboard, no seek.
   * Used for non-selected tracks so only one row ever owns audio.
   */
  live?: boolean;
  onPlaying?: (playing: boolean) => void;
  onDuration?: (seconds: number) => void;
  onJumpToComment?: (seconds: number) => void;
  /** Preview click — e.g. select this track. */
  onActivate?: () => void;
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
  compact = false,
  inline = false,
  live = true,
  onPlaying,
  onDuration,
  onJumpToComment,
  onActivate,
}: Props) {
  const paneRefs = useRef(new Map<string, HTMLDivElement>());
  const slotsRef = useRef(new Map<string, Slot>());
  const activeIdRef = useRef(activeId);
  const onTimeRef = useRef(onTime);
  const onDurationRef = useRef(onDuration);
  const onPlayingRef = useRef(onPlaying);
  const liveRef = useRef(live);
  const playheadRef = useRef(startAt);
  const startAtRef = useRef(startAt);
  const autoplayRef = useRef(autoplay);
  const appliedSeekNonceRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(startAt);
  const [duration, setDuration] = useState(0);

  onTimeRef.current = onTime;
  onDurationRef.current = onDuration;
  onPlayingRef.current = onPlaying;
  autoplayRef.current = autoplay;
  activeIdRef.current = activeId;
  liveRef.current = live;
  startAtRef.current = startAt;
  playheadRef.current = current;

  const activeClip = clips.find((clip) => clip.id === activeId) ?? clips[0];
  const waveHeight = inline ? 48 : compact ? 48 : 112;

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
        existing.ws.setOptions({
          height: waveHeight,
          interact: live,
          dragToSeek: live,
          cursorWidth: live ? (inline || compact ? 1 : 2) : 0,
          waveColor: live ? "#7a7872" : "#3f3f46",
          progressColor: live ? "#d4a054" : "#4a4a50",
        });
        continue;
      }

      const ws = WaveSurfer.create({
        container: pane,
        url: clip.url,
        height: waveHeight,
        barWidth: 2,
        barGap: 1.5,
        barRadius: 2,
        cursorWidth: live ? (inline || compact ? 1 : 2) : 0,
        waveColor: live ? "#7a7872" : "#3f3f46",
        progressColor: live ? "#d4a054" : "#4a4a50",
        cursorColor: "#f3f1ec",
        normalize: false,
        backend: "MediaElement",
        interact: live,
        dragToSeek: live,
      });
      const slot: Slot = { ws, url: clip.url, ready: false };
      slots.set(clip.id, slot);

      ws.on("ready", () => {
        slot.ready = true;
        if (activeIdRef.current !== clip.id) return;
        const d = ws.getDuration();
        const t = Math.min(Math.max(startAtRef.current, 0), d || 0);
        if (t > 0) ws.setTime(t);
        else ws.setTime(0);
        setDuration(d);
        setCurrent(t);
        playheadRef.current = t;
        setReady(true);
        onTimeRef.current(t);
        onDurationRef.current?.(d);
        if (liveRef.current && autoplayRef.current) void ws.play();
      });
      ws.on("error", () => {
        if (activeIdRef.current !== clip.id) return;
        setReady(false);
      });
      ws.on("audioprocess", () => {
        if (!liveRef.current || activeIdRef.current !== clip.id) return;
        const t = ws.getCurrentTime();
        setCurrent(t);
        playheadRef.current = t;
        onTimeRef.current(t);
      });
      ws.on("seeking", () => {
        if (!liveRef.current || activeIdRef.current !== clip.id) return;
        const t = ws.getCurrentTime();
        setCurrent(t);
        playheadRef.current = t;
        onTimeRef.current(t);
      });
      ws.on("play", () => {
        if (!liveRef.current || activeIdRef.current !== clip.id) {
          ws.pause();
          return;
        }
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
  }, [clips, compact, inline, live, waveHeight]);

  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current.values()) slot.ws.destroy();
      slotsRef.current.clear();
    };
  }, []);

  // Own audio only when live + autoplay; otherwise always paused.
  useEffect(() => {
    const slot = slotsRef.current.get(activeId);
    if (!slot?.ready) return;
    if (live && autoplay) {
      if (!slot.ws.isPlaying()) void slot.ws.play();
    } else if (slot.ws.isPlaying()) {
      slot.ws.pause();
    }
  }, [autoplay, live, activeId, ready]);

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
    // Prefer parent startAt (0 when switching tracks; retained playhead when switching versions).
    const t = Math.min(Math.max(startAtRef.current, 0), d || 0);
    next.ws.setTime(t);
    setDuration(d);
    setCurrent(t);
    playheadRef.current = t;
    setReady(true);
    onTimeRef.current(t);
    onDurationRef.current?.(d);
    if (liveRef.current && autoplayRef.current) void next.ws.play();
    else if (next.ws.isPlaying()) next.ws.pause();
  }, [activeId]);

  useEffect(() => {
    if (!live || seekTo == null) return;
    // Only apply each intentional seek once — do not re-seek when activeId changes
    // (that was resetting playhead to 0 on version switches after a track change).
    if (appliedSeekNonceRef.current === seekNonce) return;
    const slot = slotsRef.current.get(activeId);
    if (!slot?.ready) return;
    slot.ws.setTime(seekTo);
    setCurrent(seekTo);
    playheadRef.current = seekTo;
    onTimeRef.current(seekTo);
    appliedSeekNonceRef.current = seekNonce ?? null;
  }, [seekTo, seekNonce, activeId, ready, live]);

  function activeSlot() {
    return slotsRef.current.get(activeId);
  }

  function skip(delta: number) {
    if (!live) return;
    const slot = activeSlot();
    if (!slot?.ready) return;
    const next = Math.min(Math.max(slot.ws.getCurrentTime() + delta, 0), slot.ws.getDuration() || 0);
    slot.ws.setTime(next);
    setCurrent(next);
    playheadRef.current = next;
    onTimeRef.current(next);
  }

  function toggle() {
    if (!live) return;
    activeSlot()?.ws.playPause();
  }

  const skipRef = useRef(skip);
  const toggleRef = useRef(toggle);
  skipRef.current = skip;
  toggleRef.current = toggle;

  useEffect(() => {
    if (!live) return;
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
  }, [live]);

  const overlay = !ready
    ? activeClip?.error ||
      (activeClip?.url
        ? "Loading…"
        : activeClip?.converting
          ? "Converting…"
          : "Preparing…")
    : "";

  return (
    <div className={compact || inline ? "h-full w-full" : "space-y-3"}>
      <div
        className={`relative h-full touch-none ${inline ? "flex items-center" : ""}`}
        onClick={() => {
          if (!live) onActivate?.();
        }}
      >
        <div
          className={`relative w-full overflow-hidden touch-none ${
            inline
              ? "h-full min-h-[40px] rounded-md bg-surface-2/60"
              : compact
                ? "h-12 rounded-sm bg-surface-2/80"
                : "h-[112px] rounded-lg bg-surface-2"
          } ${!live ? "cursor-pointer opacity-70 hover:opacity-100" : ""}`}
        >
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
          {overlay && (
            <div
              className={`pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-center text-mute ${
                inline || compact ? "type-ui" : "text-sm"
              }`}
            >
              {overlay}
            </div>
          )}
          {live && ready && duration > 0 && (
            <div className={`absolute inset-x-0 bottom-0 z-20 ${inline ? "h-3" : compact ? "h-2.5" : "h-4"}`}>
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
                  className={`absolute -translate-x-1/2 rounded-full bg-brass hover:brightness-125 ${
                    inline ? "bottom-0.5 h-2.5 w-1" : compact ? "bottom-0 h-1.5 w-0.5" : "bottom-1 h-3 w-1.5"
                  }`}
                  style={{ left: `${(comment.timestampSeconds / duration) * 100}%` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {!compact && !inline && (
        <div className="flex items-center justify-center gap-6">
          <p className="type-mono w-12 text-right text-mute">{formatTime(current)}</p>
          <button
            type="button"
            onClick={() => skip(-10)}
            className="flex h-12 w-12 flex-col items-center justify-center rounded-full text-ink hover:text-brass"
            aria-label="Skip back 10 seconds"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden>
              <path d="M11 18V6l-8.5 6 8.5 6Zm.5-6 8.5 6V6l-8.5 6Z" />
            </svg>
            <span className="type-ui leading-none">10</span>
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
            <span className="type-ui leading-none">10</span>
          </button>
          <p className="type-mono w-12 text-mute">{formatTime(duration)}</p>
        </div>
      )}
    </div>
  );
}
