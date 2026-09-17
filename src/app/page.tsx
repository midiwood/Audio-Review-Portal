import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/projects");

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 15% 20%, #d4a05418, transparent 55%), radial-gradient(ellipse 70% 50% at 90% 80%, #d4a05410, transparent 50%), linear-gradient(165deg, #0b0b0c 0%, #121214 45%, #0b0b0c 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, #f3f1ec08 2px, #f3f1ec08 3px)",
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 pt-8 sm:px-10">
        <p className="text-xs tracking-[0.28em] text-brass uppercase">Audio Review</p>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/login" className="text-mute transition-colors duration-300 hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-md bg-brass px-3.5 py-2 font-medium text-bg transition-opacity duration-300 hover:opacity-90"
          >
            Sign up
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col justify-center px-6 pb-20 pt-16 sm:px-10">
        <p
          className="animate-[fadeUp_0.7s_ease-out_both] text-5xl font-medium tracking-tight text-ink sm:text-7xl"
          style={{ letterSpacing: "-0.03em" }}
        >
          Audio Review
        </p>
        <h1 className="mt-6 max-w-xl animate-[fadeUp_0.7s_ease-out_0.12s_both] text-2xl font-medium text-ink/95 sm:text-3xl">
          Hear every version. Leave notes that stick.
        </h1>
        <p className="mt-4 max-w-md animate-[fadeUp_0.7s_ease-out_0.22s_both] text-base leading-relaxed text-mute">
          Upload takes, scrub waveforms, and share time-coded feedback with your studio or clients.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4 animate-[fadeUp_0.7s_ease-out_0.32s_both]">
          <Link
            href="/signup"
            className="rounded-md bg-brass px-5 py-3 text-sm font-medium text-bg transition-opacity duration-300 hover:opacity-90"
          >
            Sign up free
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-line px-5 py-3 text-sm text-ink transition-colors duration-300 hover:border-brass"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
