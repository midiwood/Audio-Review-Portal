"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/users", label: "Users" },
  { href: "/settings/storage", label: "Storage" },
  { href: "/settings/email", label: "Email" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-line pb-px">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`type-ui rounded-t-md px-3 py-2 ${
              active
                ? "-mb-px border border-b-bg border-line bg-bg text-brass"
                : "text-mute hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
