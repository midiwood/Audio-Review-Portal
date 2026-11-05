import { notFound } from "next/navigation";
import { StaffJoinForm } from "./StaffJoinForm";
import { getLabelByStaffInviteToken, labelDisplayName, toProfileDto } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function StaffJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const label = getLabelByStaffInviteToken(token);
  if (!label) notFound();

  const profile = toProfileDto(label);
  const labelName = labelDisplayName(label);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-3">
          {profile.labelLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.labelLogoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ) : null}
          <div>
            <p className="type-brand">Audio Review</p>
            <h1 className="mt-1 text-3xl font-medium">Staff invite</h1>
          </div>
        </div>
        <StaffJoinForm token={token} labelName={labelName} />
      </div>
    </div>
  );
}
