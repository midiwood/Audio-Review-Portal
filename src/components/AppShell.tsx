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
  orgLogoUrl = null,
  orgName = null,
  showSettings,
  showStaff = false,
  children,
}: {
  name: string;
  avatarUrl: string | null;
  /** Label logo for label accounts and their staff. */
  orgLogoUrl?: string | null;
  orgName?: string | null;
  showSettings: boolean;
  showStaff?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isWorkspace = /^\/projects\/[^/]+$/.test(pathname);
  const inSettings = pathname.startsWith("/settings");
  const inAccount = pathname.startsWith("/profile");
  const inStaff = pathname.startsWith("/staff");
  const inProjectsNav = pathname === "/projects" || isWorkspace;
  const openNav = useCallback(() => setOpen(true), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const initial = name.slice(0, 1).toUpperCase();
  const brand = (
    <Link href="/projects" className="flex min-w-0 items-center gap-2.5">
      {orgLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={orgLogoUrl}
          alt={orgName ?? "Label"}
          className="h-8 w-8 shrink-0 rounded-md object-cover"
        />
      ) : null}
      <span className="min-w-0">
        {orgName ? (
          <>
            <span className="block truncate text-sm font-medium text-ink">{orgName}</span>
            <span className="type-brand">Audio Review</span>
          </>
        ) : (
          <span className="type-brand">Audio Review</span>
        )}
      </span>
    </Link>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-4 py-5">
        {brand}
        <div className="mt-4">
          <NotificationBell align="left" />
        </div>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <Link
          href="/projects"
          className={`type-ui rounded-md px-3 py-2 ${navClass(inProjectsNav && !inSettings && !inAccount && !inStaff)}`}
        >
          Projects
        </Link>

        {showStaff && (
          <Link href="/staff" className={`type-ui rounded-md px-3 py-2 ${navClass(inStaff)}`}>
            Label
          </Link>
        )}

        {showSettings && (
          <div className="mt-4 space-y-1">
            <p className="type-section px-3">Settings</p>
            {SETTINGS_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`type-ui block rounded-md px-3 py-2 ${navClass(pathname === item.href)}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="mt-auto flex h-[72px] flex-col justify-center gap-0.5 border-t border-line px-3">
        <Link
          href="/profile"
          className={`type-ui flex items-center gap-2.5 rounded-md px-3 py-1.5 ${navClass(inAccount)}`}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-ink">
              {initial}
            </span>
          )}
          <span className="min-w-0 truncate">{name}</span>
        </Link>
        <div className="px-3">
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
                className="type-ui shrink-0 rounded-md border border-line px-2.5 py-1.5 text-mute hover:text-ink"
                aria-label="Open menu"
              >
                Menu
              </button>
              <div className="min-w-0 flex-1">{brand}</div>
            </header>
          )}
          <main className={`min-h-0 flex-1 ${isWorkspace ? "overflow-hidden" : "overflow-y-auto"}`}>{children}</main>
        </div>
      </div>
    </AppShellNavProvider>
  );
}
