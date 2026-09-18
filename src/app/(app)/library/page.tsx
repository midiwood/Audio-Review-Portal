import { LibraryTrackList } from "@/components/LibraryTrackList";
import { requireUser } from "@/lib/auth";
import { listTracksForUser } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await requireUser();
  const tracks = listTracksForUser(user.userId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-medium text-ink">Library</h1>
        <p className="mt-1 text-sm text-mute">
          Tracks across your projects — play, download, or open in review.
        </p>
      </div>
      <LibraryTrackList tracks={tracks} />
    </div>
  );
}
