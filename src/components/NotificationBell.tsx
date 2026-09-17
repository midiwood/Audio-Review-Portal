"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationDto } from "@/lib/types";

export const WORKSPACE_REFRESH_EVENT = "arp:workspace-refresh";

const POLL_MS = 30_000;
const SEEN_KEY = "arp-notif-seen";

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  const list = [...ids].slice(-200);
  localStorage.setItem(SEEN_KEY, JSON.stringify(list));
}

function formatWhen(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function NotificationBell({ align = "right" }: { align?: "left" | "right" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const permissionAsked = useRef(false);
  const primed = useRef(false);
  const knownUnreadIds = useRef<Set<string>>(new Set());

  const showBrowserAlerts = useCallback((notifications: NotificationDto[]) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const seen = loadSeenIds();
    let changed = false;
    for (const item of notifications) {
      if (seen.has(item.id)) continue;
      try {
        new Notification(item.title, {
          body: item.body || undefined,
          tag: item.id,
        });
      } catch {
        // Ignore blocked or unsupported Notification construction.
      }
      seen.add(item.id);
      changed = true;
    }
    if (changed) saveSeenIds(seen);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const json = (await res.json()) as { notifications?: NotificationDto[]; unreadCount?: number };
      const next = json.notifications ?? [];
      setItems(next);
      setUnreadCount(Number(json.unreadCount ?? 0));
      showBrowserAlerts(next);

      if (primed.current) {
        const arrived = next.filter((item) => !knownUnreadIds.current.has(item.id));
        if (arrived.length > 0) {
          window.dispatchEvent(
            new CustomEvent(WORKSPACE_REFRESH_EVENT, {
              detail: { notifications: arrived },
            }),
          );
          router.refresh();
        }
      } else {
        primed.current = true;
      }
      knownUnreadIds.current = new Set(next.map((item) => item.id));
    } catch {
      // Ignore transient poll failures.
    }
  }, [router, showBrowserAlerts]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function ensurePermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "default" || permissionAsked.current) return;
    permissionAsked.current = true;
    try {
      await Notification.requestPermission();
    } catch {
      // Ignore.
    }
  }

  async function markRead(id?: string, all?: boolean) {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { all: true } : { id }),
    });
    await refresh();
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
        onClick={() => {
          void ensurePermission();
          setOpen((current) => !current);
          void refresh();
        }}
        className="relative rounded-md border border-line p-1.5 text-mute hover:border-brass hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
          <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brass px-1 text-[10px] font-medium text-bg">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className={`absolute top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-xl ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <p className="text-xs font-medium tracking-wide text-mute uppercase">Notifications</p>
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => void markRead(undefined, true)}
                className="text-xs text-brass hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-mute">No notifications yet.</li>
            )}
            {items.map((item) => (
              <li key={item.id} className="bg-brass-dim/30">
                <a
                  href={item.href}
                  onClick={() => {
                    void markRead(item.id);
                    setOpen(false);
                  }}
                  className="block px-3 py-2.5 hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-ink">{item.title}</p>
                    <span className="shrink-0 text-[10px] text-mute">{formatWhen(item.createdAt)}</span>
                  </div>
                  {item.body && <p className="mt-0.5 line-clamp-2 text-xs text-mute">{item.body}</p>}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
