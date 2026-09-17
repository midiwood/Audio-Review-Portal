import { CreateProjectForm } from "@/components/CreateProjectForm";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { ProjectTrash } from "@/components/ProjectTrash";
import { canCreateProjects, requireUser } from "@/lib/auth";
import { listArchivedProjectsForOwner, listProjectsForUser } from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { ProjectListItem } from "@/lib/types";
import Link from "next/link";

function ProjectList({
  projects,
  showDelete,
}: {
  projects: ProjectListItem[];
  showDelete: boolean;
}) {
  if (projects.length === 0) return null;
  return (
    <ul className="divide-y divide-line">
      {projects.map((project) => (
        <li key={project.id} className="group flex items-center gap-1">
          <Link
            href={`/projects/${project.id}`}
            className="flex min-w-0 flex-1 flex-col gap-0.5 py-3 hover:text-brass sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-ink group-hover:text-brass">{project.name}</span>
              {project.unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-brass px-1.5 py-0.5 text-[10px] font-medium text-bg">
                  {project.unreadCount}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-mute">
              {project.trackCount} track{project.trackCount === 1 ? "" : "s"} · {formatDate(project.createdAt)}
            </span>
          </Link>
          {showDelete && <DeleteProjectButton projectId={project.id} projectName={project.name} />}
        </li>
      ))}
    </ul>
  );
}

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = listProjectsForUser(user.userId);
  const owned = projects.filter((p) => p.ownership === "owned");
  const shared = projects.filter((p) => p.ownership === "shared");
  const canCreate = canCreateProjects(user);
  const archived = canCreate ? listArchivedProjectsForOwner(user.userId) : [];
  const bothEmpty = owned.length === 0 && shared.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      {canCreate && <CreateProjectForm />}

      {bothEmpty ? (
        <p className="text-sm text-mute">
          {canCreate
            ? "Create a project to invite collaborators and review uploads."
            : "When someone invites you, shared projects appear here."}
        </p>
      ) : (
        <>
          <section className="space-y-1">
            {owned.length > 0 && (
              <h2 className="text-xs font-medium tracking-wide text-mute uppercase">My projects</h2>
            )}
            {owned.length === 0 ? (
              canCreate ? null : (
                <p className="text-sm text-mute">Creating projects requires a subscription.</p>
              )
            ) : (
              <ProjectList projects={owned} showDelete={canCreate} />
            )}
          </section>

          {shared.length > 0 && (
            <section className="space-y-1">
              <h2 className="text-xs font-medium tracking-wide text-mute uppercase">Shared with me</h2>
              <ProjectList projects={shared} showDelete={false} />
            </section>
          )}
        </>
      )}

      {canCreate && <ProjectTrash projects={archived} />}
    </div>
  );
}
