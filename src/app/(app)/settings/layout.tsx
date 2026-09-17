import type { ReactNode } from "react";
import { requireSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireSuperadmin();
  return <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</div>;
}
