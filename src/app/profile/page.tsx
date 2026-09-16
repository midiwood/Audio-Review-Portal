import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { requireUser } from "@/lib/auth";
import { findUserById, toProfileDto } from "@/lib/data";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireUser();
  const user = findUserById(session.userId);
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.25em] text-brass uppercase">Audio Review</p>
            <h1 className="text-xl font-medium">Profile</h1>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <Link href="/projects" className="text-sm text-mute hover:text-ink">
              All projects
            </Link>
            {session.role === "admin" && (
              <Link href="/storage" className="text-sm text-mute hover:text-ink">
                Storage
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <p className="mb-6 text-sm text-mute">Update your name, photo, email, or password.</p>
        <ProfileForm initial={toProfileDto(user)} />
      </main>
    </div>
  );
}
