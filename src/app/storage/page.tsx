import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { requireUser } from "@/lib/auth";
import { StorageForm } from "./StorageForm";

export const dynamic = "force-dynamic";

export default async function StoragePage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/projects");
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host") || "localhost:3001";
  const proto = (await headers()).get("x-forwarded-proto") || "http";
  const origin = `${proto}://${host}`;

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.25em] text-brass uppercase">Audio Review</p>
            <h1 className="text-xl font-medium">Storage</h1>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <Link href="/projects" className="text-sm text-mute hover:text-ink">
              All projects
            </Link>
            <Link href="/profile" className="text-sm text-mute hover:text-ink">
              Profile
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <p className="mb-6 text-sm text-mute">
          Stream and store audio on DigitalOcean Spaces so files do not pass through the web host.
        </p>
        <StorageForm origin={origin} />
      </main>
    </div>
  );
}
