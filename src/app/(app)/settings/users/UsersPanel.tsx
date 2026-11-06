"use client";

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import type { AccountPlan, AdminUserDto } from "@/lib/types";

type PlanFilter = "all" | AccountPlan | "superadmin";

const PLAN_FILTERS: { id: PlanFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "superadmin", label: "Superadmin" },
  { id: "label", label: "Label" },
  { id: "subscriber", label: "Subscriber" },
  { id: "staff", label: "Staff" },
  { id: "free", label: "Free" },
];

function planBadgeClass(plan: AccountPlan, role: string) {
  if (role === "superadmin") return "bg-brass-dim text-brass";
  if (plan === "label") return "bg-emerald-950/50 text-emerald-400";
  if (plan === "subscriber") return "bg-sky-950/50 text-sky-300";
  if (plan === "staff") return "bg-violet-950/40 text-violet-300";
  return "bg-surface-2 text-mute";
}

function Avatar({
  url,
  name,
  rounded = "full",
}: {
  url: string | null;
  name: string;
  rounded?: "full" | "lg";
}) {
  const radius = rounded === "lg" ? "rounded-lg" : "rounded-full";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={`h-10 w-10 shrink-0 object-cover ${radius}`} />;
  }
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center bg-surface-2 text-sm text-ink ${radius}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function UsersPanel({
  initial,
  initialDeleted,
}: {
  initial: AdminUserDto[];
  initialDeleted: AdminUserDto[];
}) {
  const [users, setUsers] = useState(initial);
  const [deleted, setDeleted] = useState(initialDeleted);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const stats = useMemo(() => {
    const counts = { total: users.length, free: 0, subscriber: 0, label: 0, staff: 0, superadmin: 0 };
    for (const user of users) {
      if (user.role === "superadmin") counts.superadmin += 1;
      else counts[user.plan] += 1;
    }
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((user) => {
      if (planFilter === "superadmin" && user.role !== "superadmin") return false;
      if (planFilter !== "all" && planFilter !== "superadmin") {
        if (user.role === "superadmin" || user.plan !== planFilter) return false;
      }
      if (!q) return true;
      return (
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        (user.labelName?.toLowerCase().includes(q) ?? false) ||
        (user.labelAccountName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [users, query, planFilter]);

  async function setPlan(user: AdminUserDto, plan: "free" | "subscriber" | "label") {
    setBusyId(user.id);
    setError("");
    try {
      const res = await fetch(`/api/settings/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not update user");
      setUsers((current) =>
        current.map((row) =>
          row.id === user.id
            ? {
                ...row,
                ...json.user,
                plan: json.user.plan,
                planLabel: json.user.planLabel,
                subscribed: json.user.subscribed,
                labelName: json.user.labelName ?? null,
                labelLogoUrl: json.user.labelLogoUrl ?? null,
                staffCount: json.user.plan === "label" ? row.staffCount : 0,
              }
            : row,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update user");
    } finally {
      setBusyId("");
    }
  }

  async function deleteUser(user: AdminUserDto) {
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

  async function restoreDeletedUser(user: AdminUserDto) {
    setBusyId(user.id);
    setError("");
    try {
      const res = await fetch(`/api/settings/users/${user.id}/restore`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not restore user");
      setDeleted((current) => current.filter((row) => row.id !== user.id));
      setUsers((current) => [
        {
          ...user,
          ...json.user,
          deletedAt: undefined,
          plan: json.user.plan ?? user.plan,
          planLabel: json.user.planLabel ?? user.planLabel,
        },
        ...current,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore user");
    } finally {
      setBusyId("");
    }
  }

  function detailLine(user: AdminUserDto) {
    const bits: string[] = [];
    if (user.plan === "label") {
      if (user.labelName) bits.push(user.labelName);
      bits.push(`${user.staffCount} staff`);
      bits.push(`${user.ownedProjectCount} project${user.ownedProjectCount === 1 ? "" : "s"}`);
    } else if (user.plan === "staff") {
      bits.push(user.labelAccountName ? `Staff of ${user.labelAccountName}` : "Staff (no label)");
      bits.push(`${user.ownedProjectCount + user.memberProjectCount} projects`);
    } else if (user.role === "superadmin") {
      bits.push("Full access");
      if (user.labelName) bits.push(user.labelName);
      if (user.staffCount) bits.push(`${user.staffCount} staff`);
    } else if (user.plan === "subscriber") {
      bits.push(`${user.ownedProjectCount} owned`);
      if (user.memberProjectCount) bits.push(`${user.memberProjectCount} shared`);
    } else {
      bits.push(`${user.memberProjectCount} shared project${user.memberProjectCount === 1 ? "" : "s"}`);
    }
    bits.push(`Joined ${formatDate(user.createdAt)}`);
    return bits.join(" · ");
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            { label: "Total", value: stats.total },
            { label: "Labels", value: stats.label },
            { label: "Subscribers", value: stats.subscriber },
            { label: "Staff", value: stats.staff },
            { label: "Free", value: stats.free },
            { label: "Deleted", value: deleted.length },
          ] as const
        ).map((item) => (
          <div key={item.label} className="rounded-lg border border-line bg-surface px-3 py-3">
            <p className="type-section">{item.label}</p>
            <p className="mt-1 text-2xl font-medium tabular-nums text-ink">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, label…"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1">
          {PLAN_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPlanFilter(item.id)}
              className={`type-ui rounded-full px-2.5 py-1 ${
                planFilter === item.id ? "bg-brass text-bg" : "bg-surface-2 text-mute hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_7.5rem_minmax(0,1.4fr)_auto] gap-3 border-b border-line px-4 py-2 text-mute min-[720px]:grid">
          <span className="type-section">User</span>
          <span className="type-section">Plan</span>
          <span className="type-section">Activity</span>
          <span className="type-section text-right">Actions</span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mute">No users match this filter.</p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((user) => {
              const displayAvatar =
                user.plan === "label" ? user.labelLogoUrl ?? user.avatarUrl : user.avatarUrl;
              const displayName = user.plan === "label" && user.labelName ? user.labelName : user.name;
              return (
                <li
                  key={user.id}
                  className="grid grid-cols-1 gap-3 px-4 py-3 min-[720px]:grid-cols-[minmax(0,1.6fr)_7.5rem_minmax(0,1.4fr)_auto] min-[720px]:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      url={displayAvatar}
                      name={displayName}
                      rounded={user.plan === "label" ? "lg" : "full"}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{displayName}</p>
                      <p className="truncate text-sm text-mute">{user.email}</p>
                      {user.plan === "label" && user.labelName && user.name !== user.labelName && (
                        <p className="truncate text-xs text-mute">Account: {user.name}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className={`type-ui inline-flex rounded-full px-2 py-0.5 ${planBadgeClass(user.plan, user.role)}`}>
                      {user.planLabel}
                    </span>
                  </div>

                  <p className="text-sm text-mute">{detailLine(user)}</p>

                  <div className="flex flex-wrap items-center gap-2 min-[720px]:justify-end">
                    {user.role === "superadmin" ? (
                      <span className="text-xs text-brass">Protected</span>
                    ) : user.plan === "staff" ? (
                      <span className="text-xs text-mute" title="Change plan from their label’s Staff page">
                        Label-managed
                      </span>
                    ) : (
                      <select
                        value={
                          user.plan === "subscriber" || user.plan === "label" ? user.plan : "free"
                        }
                        disabled={busyId === user.id}
                        onChange={(e) => void setPlan(user, e.target.value as "free" | "subscriber" | "label")}
                        className="rounded-md border border-line bg-bg px-2 py-1 text-sm outline-none focus:border-brass disabled:opacity-40"
                        aria-label={`Plan for ${user.name}`}
                      >
                        <option value="free">Free</option>
                        <option value="subscriber">Subscriber</option>
                        <option value="label">Label</option>
                      </select>
                    )}
                    {user.role !== "superadmin" && (
                      <button
                        type="button"
                        disabled={busyId === user.id}
                        onClick={() => void deleteUser(user)}
                        className="text-sm text-rose-300/90 hover:text-rose-200 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-mute">
        Showing {filtered.length} of {users.length} active user{users.length === 1 ? "" : "s"}
        {planFilter !== "all" ? ` · filter: ${planFilter}` : ""}
        {query.trim() ? ` · search: “${query.trim()}”` : ""}
      </p>

      {deleted.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowDeleted((open) => !open)}
            className="type-section flex items-center gap-2 hover:text-ink"
          >
            Deleted users ({deleted.length})
            <span className="text-mute">{showDeleted ? "Hide" : "Show"}</span>
          </button>
          {showDeleted && (
            <>
              <p className="text-xs text-mute">
                Restoring re-enables the account and any owned projects trashed with the delete. Project memberships are
                not restored.
              </p>
              <ul className="divide-y divide-line rounded-xl border border-dashed border-line bg-surface/60">
                {deleted.map((user) => (
                  <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-mute">{user.name}</p>
                      <p className="truncate text-sm text-mute/80">
                        {user.email}
                        {user.deletedAt ? ` · deleted ${formatDate(user.deletedAt)}` : ""}
                      </p>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
