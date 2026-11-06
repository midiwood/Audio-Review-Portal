"use client";

import { useEffect, useState } from "react";
import type { ComposerDto } from "@/lib/types";

type Props = {
  labelName: string;
  initialToken: string | null;
};

export function StaffPanel({ labelName, initialToken }: Props) {
  const [staff, setStaff] = useState<ComposerDto[]>([]);
  const [inviteable, setInviteable] = useState<ComposerDto[]>([]);
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    const res = await fetch("/api/label/staff");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not load staff");
    setStaff(json.staff ?? []);
    setInviteable(json.inviteable ?? []);
    if (json.staffInviteToken) setToken(json.staffInviteToken);
  }

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : "Could not load staff"));
  }, []);

  async function copyInvite() {
    if (!token) return;
    const url = `${window.location.origin}/staff-join/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function addStaff(userId: string) {
    setBusy(userId);
    setError("");
    try {
      const res = await fetch("/api/label/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not add staff");
      setStaff(json.staff ?? []);
      setInviteable(json.inviteable ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add staff");
    } finally {
      setBusy("");
    }
  }

  async function removeStaff(userId: string, name: string) {
    if (!confirm(`Remove ${name} from staff? They will lose access to label projects.`)) return;
    setBusy(userId);
    setError("");
    try {
      const res = await fetch("/api/label/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not remove staff");
      setStaff(json.staff ?? []);
      setInviteable(json.inviteable ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove staff");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium">Staff</h2>
        <p className="mt-1 text-sm text-mute">
          People on {labelName}&apos;s feed. Staff can open every label project and create new ones under the label.
        </p>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
        <p className="type-section">Invite link</p>
        <p className="text-sm text-mute">Anyone with the link can join as staff of this label.</p>
        <button
          type="button"
          disabled={!token}
          onClick={() => void copyInvite()}
          className="type-ui rounded-md border border-line px-3 py-2 text-mute hover:border-brass hover:text-ink disabled:opacity-40"
        >
          {copied ? "Staff invite link copied" : "Copy staff invite link"}
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="type-section">Current staff</h2>
        {staff.length === 0 ? (
          <p className="text-sm text-mute">No staff yet. Share the invite link to add people.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {staff.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-4 py-3">
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs">
                    {person.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{person.name}</p>
                  <p className="truncate text-sm text-mute">{person.email}</p>
                </div>
                <button
                  type="button"
                  disabled={busy === person.id}
                  onClick={() => void removeStaff(person.id, person.name)}
                  className="text-sm text-rose-300/90 hover:text-rose-200 disabled:opacity-40"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inviteable.length > 0 && (
        <section className="space-y-2">
          <h2 className="type-section">Add from composers</h2>
          <p className="text-sm text-mute">Free members who have worked on your projects.</p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {inviteable.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{person.name}</p>
                  <p className="truncate text-sm text-mute">{person.email}</p>
                </div>
                <button
                  type="button"
                  disabled={busy === person.id}
                  onClick={() => void addStaff(person.id)}
                  className="text-sm text-brass hover:text-ink disabled:opacity-40"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
