import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4">
      <p className="type-brand">Audio Review</p>
      <h1 className="text-2xl font-medium">Not found</h1>
      <p className="text-sm text-mute">This project or share link does not exist.</p>
      <Link href="/" className="text-sm text-brass hover:underline">
        Home
      </Link>
    </div>
  );
}
