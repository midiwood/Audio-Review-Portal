"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShellNavProvider } from "@/components/AppShellNav";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

const SETTINGS_LINKS = [
  { href: "/settings/storage", label: "Storage" },
  { href: "/settings/email", label: "Email" },
  { href: "/settings/users", label: "Users" },
] as const;

function navClass(active: boolean) {
  return active
    ? "bg-brass-dim text-brass"
    : "text-mute hover:bg-surface-2 hover:text-ink";
}

export function AppShell({
  name,
  avatarUrl,
  showSettings,
  children,
}: {
  name: string;
  avatarUrl: string | null;
  showSettings: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isWorkspace = /^\/projects\/[^/]+$/.test(pathname);
  const inSettings = pathname.startsWith("/settings");
  const inAccount = pathname.startsWith("/profile");
  const inProjectsNav = pathname === "/projects" || isWorkspace;
  const openNav = useCallback(() => setOpen(true), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initial = name.slice(0, 1).toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-5">
        <Link href="/projects" className="block">
          <p className="text-[11px] tracking-[0.28em] text-brass uppercase">Audio Review</p>
        </Link>
        <div className="mt-4">
          <NotificationBell align="left" />
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <Link
          href="/projects"
          className={`rounded-md px-3 py-2 text-sm font-medium ${navClass(inProjectsNav && !inSettings && !inAccount)}`}
        >
          Projects
        </Link>

        {showSettings && (
          <div className="mt-4 space-y-1">
            <p className="px-3 text-[11px] tracking-[0.18em] text-mute uppercase">Settings</p>
            {SETTINGS_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-md px-3 py-2 text-sm ${navClass(pathname === item.href)}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="mt-auto space-y-1 border-t border-line px-3 py-4">
        <Link
          href="/profile"
          className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${navClass(inAccount)}`}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs text-ink">
              {initial}
            </span>
          )}
          <span className="min-w-0 truncate">{name}</span>
        </Link>
        <div className="px-3 py-1">
          <LogoutButton />
        </div>
      </div>
    </div>
  );

  return (
    <AppShellNavProvider openNav={openNav}>
      <div className="flex h-dvh bg-bg">
        <aside className="hidden w-56 shrink-0 border-r border-line bg-surface min-[880px]:flex min-[880px]:flex-col">
          {sidebar}
        </aside>

        {open && (
          <div className="fixed inset-0 z-40 min-[880px]:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <aside className="relative z-10 flex h-full w-64 flex-col border-r border-line bg-surface shadow-xl">
              {sidebar}
            </aside>
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Non-workspace pages keep a mobile menu bar; workspace owns its own chrome. */}
          {!isWorkspace && (
            <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 min-[880px]:hidden">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-md border border-line px-2.5 py-1.5 text-sm text-mute hover:text-ink"
                aria-label="Open menu"
              >
                Menu
              </button>
              <p className="text-xs tracking-[0.22em] text-brass uppercase">Audio Review</p>
            </header>
          )}
          <main className={`min-h-0 flex-1 ${isWorkspace ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</main>
        </div>
      </div>
    </AppShellNavProvider>
  );
}
