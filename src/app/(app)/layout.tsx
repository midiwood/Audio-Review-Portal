import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { isSuperadmin, requireUser } from "@/lib/auth";
import { findUserById, toProfileDto } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  const row = findUserById(session.userId);
  const avatarUrl = row ? toProfileDto(row).avatarUrl : null;

  return (
    <AppShell name={session.name} avatarUrl={avatarUrl} showSettings={isSuperadmin(session)}>
      {children}
    </AppShell>
  );
}
