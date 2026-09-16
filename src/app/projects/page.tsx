import Link from "next/link";
import { CreateProjectForm } from "@/components/CreateProjectForm";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { ProjectTrash } from "@/components/ProjectTrash";
import { requireUser } from "@/lib/auth";
import { listArchivedProjectsForOwner, listProjectsForUser } from "@/lib/data";
import { formatDate } from "@/lib/format";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = listProjectsForUser(user.userId, user.role);
  const archived = user.role === "admin" ? listArchivedProjectsForOwner(user.userId) : [];
  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-xs tracking-[0.25em] text-brass uppercase">Audio Review</p>
            <h1 className="text-xl font-medium">Projects</h1>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <Link href="/profile" className="text-sm text-mute hover:text-ink">
              {user.name}
            </Link>
            {isAdmin && (
              <Link href="/storage" className="text-sm text-mute hover:text-ink">
                Storage
              </Link>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
        {isAdmin && <CreateProjectForm />}
        {projects.length === 0 ? (
          <p className="text-sm text-mute">
            {isAdmin
              ? "Create a project, invite composers, and review their uploads."
              : "When an admin invites you, the project will appear here."}
          </p>
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center gap-2">
                <Link
                  href={`/projects/${project.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 hover:border-brass"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{project.name}</span>
                      {project.unreadCount > 0 && (
                        <span className="rounded-full bg-brass px-2 py-0.5 text-[11px] font-medium text-bg">
                          {project.unreadCount} new
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-mute">
                      {project.trackCount} track{project.trackCount === 1 ? "" : "s"} · {formatDate(project.createdAt)}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 text-sm text-brass">Open</span>
                </Link>
                {isAdmin && <DeleteProjectButton projectId={project.id} projectName={project.name} />}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && <ProjectTrash projects={archived} />}
      </main>
    </div>
  );
}
