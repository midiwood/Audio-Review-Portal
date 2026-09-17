import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { findUserById, toProfileDto } from "@/lib/data";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireUser();
  const user = findUserById(session.userId);
  if (!user) redirect("/login");
  const profile = toProfileDto(user);

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-medium">Account</h1>
        <p className="mt-1 text-sm text-mute">Name, photo, email, and password.</p>
      </div>
      {!profile.subscribed && profile.role === "member" && (
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-mute">
          Free plan — join shared projects and upload. Creating projects needs a subscription.
        </p>
      )}
      <ProfileForm initial={profile} />
    </div>
  );
}
