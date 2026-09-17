import { listDeletedUsersForAdmin, listUsersForAdmin } from "@/lib/data";
import { UsersPanel } from "./UsersPanel";

export const dynamic = "force-dynamic";

export default function SettingsUsersPage() {
  const users = listUsersForAdmin();
  const deleted = listDeletedUsersForAdmin();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Users</h2>
        <p className="mt-1 text-sm text-mute">
          Subscribers can create and own projects. Free members join via invite and upload on shared projects.
        </p>
      </div>
      <UsersPanel initial={users} initialDeleted={deleted} />
    </div>
  );
}
