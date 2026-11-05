import { CreateProjectForm } from "@/components/CreateProjectForm";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { ProjectTrash } from "@/components/ProjectTrash";
import { canCreateProjects, projectOwnerIdFor, requireUser } from "@/lib/auth";
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
                <span className="type-ui shrink-0 rounded-full bg-brass px-1.5 py-0.5 text-bg">
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
  const labelFeed = projects.filter((p) => p.ownership === "label");
  const shared = projects.filter((p) => p.ownership === "shared");
  const canCreate = canCreateProjects(user);
  const feedOwnerId = projectOwnerIdFor(user);
  const archived = canCreate ? listArchivedProjectsForOwner(feedOwnerId) : [];
  const bothEmpty = owned.length === 0 && labelFeed.length === 0 && shared.length === 0;
  const isStaff = user.plan === "staff";
  const isLabel = user.plan === "label";
  const isSuper = user.role === "superadmin";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      {canCreate && <CreateProjectForm />}

      {bothEmpty ? (
        <p className="text-sm text-mute">
          {isStaff
            ? "No label projects yet. Create one to start the feed, or wait for your label to add projects."
            : canCreate
              ? isSuper
                ? "Create a project to invite composers and share a client review link. Add staff and branding from the Label page."
                : isLabel
                  ? "Create a project for your label feed. Invite composers and add staff from the Label page."
                  : "Create a project to invite composers and share a client review link."
              : "Free plan: when a studio invites you, shared projects appear here. Creating your own projects needs a subscription."}
        </p>
      ) : (
        <>
          {owned.length > 0 && (
            <section className="space-y-1">
              <h2 className="type-section">
                {isSuper ? "All projects" : isLabel ? "Label projects" : "My projects"}
              </h2>
              <ProjectList projects={owned} showDelete={canCreate} />
            </section>
          )}

          {labelFeed.length > 0 && (
            <section className="space-y-1">
              <h2 className="type-section">Label projects</h2>
              <ProjectList projects={labelFeed} showDelete={canCreate} />
            </section>
          )}

          {owned.length === 0 && labelFeed.length === 0 && !canCreate && (
            <p className="text-sm text-mute">
              Creating projects needs a subscription. You can still open shared projects you were invited to.
            </p>
          )}

          {shared.length > 0 && (
            <section className="space-y-1">
              <h2 className="type-section">Shared with me</h2>
              <ProjectList projects={shared} showDelete={false} />
            </section>
          )}
        </>
      )}

      {canCreate && <ProjectTrash projects={archived} />}
    </div>
  );
}
