"use client";

import { useState } from "react";
import { appendPreparedAvatar } from "@/lib/avatar-client";
import type { PlanLabel, UserRole } from "@/lib/types";

type Profile = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  subscribed: boolean;
  planLabel: PlanLabel;
  avatarUrl: string | null;
};

export function ProfileForm({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [preview, setPreview] = useState(initial.avatarUrl);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          const form = e.currentTarget;
          const data = new FormData(form);
          await appendPreparedAvatar(data, (form.elements.namedItem("photo") as HTMLInputElement).files?.[0]);
          const res = await fetch("/api/profile", { method: "PATCH", body: data });
          const json = await res.json();
          if (!res.ok) {
            setError(json.error ?? "Could not save profile");
            return;
          }
          setProfile(json.user);
          setPreview(json.user.avatarUrl);
          setSaved(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save profile");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center gap-4">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-lg text-mute">
            {profile.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-medium">{profile.name}</p>
          <p className="text-sm text-mute">{profile.planLabel}</p>
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-mute">
          Profile photo <span className="text-mute/70">(optional)</span>
        </span>
        <input
          name="photo"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPreview(URL.createObjectURL(file));
          }}
          className="w-full text-xs text-mute"
        />
        <span className="block text-xs text-mute">Resized to a small square JPEG automatically.</span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-mute">Name</span>
        <input
          name="name"
          defaultValue={profile.name}
          required
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-mute">Email</span>
        <input
          name="email"
          type="email"
          defaultValue={profile.email}
          required
          autoComplete="username"
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-mute">Current password</span>
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
        <span className="block text-xs text-mute">Needed only to change email or password.</span>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-mute">New password</span>
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-300">Profile saved.</p>}
      <button disabled={busy} className="rounded-md bg-brass px-4 py-2.5 text-sm font-medium text-bg disabled:opacity-40">
        Save profile
      </button>
    </form>
  );
}
