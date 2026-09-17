"use client";

import { useState } from "react";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "member";
  subscribed: boolean;
  planLabel: "Superadmin" | "Subscriber" | "Free member";
  deletedAt?: number;
};

export function UsersPanel({
  initial,
  initialDeleted,
}: {
  initial: UserRow[];
  initialDeleted: UserRow[];
}) {
  const [users, setUsers] = useState(initial);
  const [deleted, setDeleted] = useState(initialDeleted);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function toggleSubscribed(user: UserRow, subscribed: boolean) {
    setBusyId(user.id);
    setError("");
    try {
      const res = await fetch(`/api/settings/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not update user");
      setUsers((current) => current.map((row) => (row.id === user.id ? { ...row, ...json.user } : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update user");
    } finally {
      setBusyId("");
    }
  }

  async function deleteUser(user: UserRow) {
    const ok = window.confirm(
      `Delete ${user.name} (${user.email})?\n\nTheir account will be disabled, memberships removed, and owned projects moved to trash. You can restore them later.`,
    );
    if (!ok) return;
    setBusyId(user.id);
    setError("");
    try {
      const res = await fetch(`/api/settings/users/${user.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not delete user");
      setUsers((current) => current.filter((row) => row.id !== user.id));
      setDeleted((current) => [{ ...user, deletedAt: Date.now() }, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete user");
    } finally {
      setBusyId("");
    }
  }

  async function restoreDeletedUser(user: UserRow) {
    setBusyId(user.id);
    setError("");
    try {
      const res = await fetch(`/api/settings/users/${user.id}/restore`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not restore user");
      setDeleted((current) => current.filter((row) => row.id !== user.id));
      setUsers((current) => [{ ...user, ...json.user, deletedAt: undefined }, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore user");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      {error && <p className="text-sm text-rose-300">{error}</p>}

      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {users.map((user) => (
          <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-sm text-mute">{user.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-mute">{user.planLabel}</span>
              {user.role === "superadmin" ? (
                <span className="text-xs text-brass">Always subscribed</span>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={user.subscribed}
                      disabled={busyId === user.id}
                      onChange={(e) => void toggleSubscribed(user, e.target.checked)}
                    />
                    Subscriber
                  </label>
                  <button
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => void deleteUser(user)}
                    className="text-sm text-rose-300/90 hover:text-rose-200 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {deleted.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-mute">Deleted users</h3>
            <p className="mt-1 text-xs text-mute">
              Restoring re-enables the account and any owned projects trashed with the delete. Project memberships are
              not restored.
            </p>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line border-dashed bg-surface/60">
            {deleted.map((user) => (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-mute">{user.name}</p>
                  <p className="truncate text-sm text-mute/80">{user.email}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === user.id}
                  onClick={() => void restoreDeletedUser(user)}
                  className="text-sm text-brass hover:text-ink disabled:opacity-40"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
