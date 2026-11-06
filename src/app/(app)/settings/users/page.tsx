import { listDeletedUsersForAdmin, listUsersForAdmin } from "@/lib/data";
import { UsersPanel } from "./UsersPanel";

export const dynamic = "force-dynamic";

export default function SettingsUsersPage() {
  const users = listUsersForAdmin();
  const deleted = listDeletedUsersForAdmin();
  return (
    <div className="space-y-5">
      <div>
        <h2 className="type-title">Users</h2>
        <p className="mt-1 text-sm text-mute">
          Overview of every account. Assign Free, Subscriber, or Label. Staff are invited by Labels and managed from
          their Label page.
        </p>
      </div>
      <UsersPanel initial={users} initialDeleted={deleted} />
    </div>
  );
}
