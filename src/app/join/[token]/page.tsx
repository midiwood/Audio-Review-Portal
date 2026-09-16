import { notFound } from "next/navigation";
import { JoinForm } from "./JoinForm";
import { getProjectByInviteToken } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const project = getProjectByInviteToken(token);
  if (!project) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <p className="text-xs tracking-[0.25em] text-brass uppercase">Audio Review</p>
          <h1 className="mt-2 text-3xl font-medium">Composer invite</h1>
        </div>
        <JoinForm token={token} projectName={project.name} />
      </div>
    </div>
  );
}
