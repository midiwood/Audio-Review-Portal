import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { isLabelAccount, isSuperadmin, requireUser } from "@/lib/auth";
import { findUserById, labelDisplayName, toProfileDto } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const session = await requireUser();
  const row = findUserById(session.userId);
  const profile = row ? toProfileDto(row) : null;

  let orgLogoUrl: string | null = null;
  let orgName: string | null = null;
  if (isLabelAccount(session) && row) {
    orgLogoUrl = profile?.labelLogoUrl ?? null;
    orgName = labelDisplayName(row);
  } else if (session.plan === "staff" && session.labelId) {
    const label = findUserById(session.labelId);
    if (label) {
      const labelProfile = toProfileDto(label);
      orgLogoUrl = labelProfile.labelLogoUrl;
      orgName = labelDisplayName(label);
    }
  }

  return (
    <AppShell
      name={session.name}
      avatarUrl={profile?.avatarUrl ?? null}
      orgLogoUrl={orgLogoUrl}
      orgName={orgName}
      showSettings={isSuperadmin(session)}
      showStaff={isLabelAccount(session)}
    >
      {children}
    </AppShell>
  );
}
