import { notFound } from "next/navigation";
import { ReviewWorkspace } from "@/components/review/ReviewWorkspace";
import { requireUser } from "@/lib/auth";
import { findUserById, getProjectAccess, getProjectById, toProfileDto } from "@/lib/data";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ track?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { track: trackId } = await searchParams;
  const access = getProjectAccess(id, user.userId);
  if (!access) notFound();
  const project = getProjectById(id, {
    kind: access.kind,
    composerId: user.userId,
    includeComments: true,
    includeInvite: access.kind === "admin",
  });
  if (!project) notFound();
  const profile = findUserById(user.userId);

  return (
    <ReviewWorkspace
      mode={access.kind}
      project={project}
      ownerName={user.name}
      userId={user.userId}
      avatarUrl={profile ? toProfileDto(profile).avatarUrl : null}
      initialTrackId={trackId}
    />
  );
}
