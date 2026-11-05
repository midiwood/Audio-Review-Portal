import { redirect } from "next/navigation";
import { isLabelAccount, requireUser } from "@/lib/auth";
import { ensureStaffInviteToken, findUserById, labelDisplayName, toProfileDto } from "@/lib/data";
import { LabelBrandingForm } from "./LabelBrandingForm";
import { StaffPanel } from "./StaffPanel";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const session = await requireUser();
  if (!isLabelAccount(session)) redirect("/projects");

  ensureStaffInviteToken(session.userId);
  const row = findUserById(session.userId);
  if (!row) redirect("/login");
  const profile = toProfileDto(row);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <LabelBrandingForm
        initialName={profile.labelName}
        initialLogoUrl={profile.labelLogoUrl}
        personalName={profile.name}
      />
      <StaffPanel labelName={labelDisplayName(row)} initialToken={profile.staffInviteToken} />
    </div>
  );
}
