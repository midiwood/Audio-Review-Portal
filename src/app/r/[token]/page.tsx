import { notFound } from "next/navigation";
import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { getProjectByShareToken } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string; trackId?: string }>;
}) {
  const { token, trackId } = await params;
  const project = getProjectByShareToken(token);
  if (!project) notFound();
  return <ReviewWorkspace mode="reviewer" project={project} shareToken={token} initialTrackId={trackId} />;
}
