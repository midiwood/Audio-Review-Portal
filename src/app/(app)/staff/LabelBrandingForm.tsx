"use client";

import { useState } from "react";
import { appendPreparedAvatar } from "@/lib/avatar-client";

type Props = {
  initialName: string | null;
  initialLogoUrl: string | null;
  personalName: string;
};

export function LabelBrandingForm({ initialName, initialLogoUrl, personalName }: Props) {
  const [labelName, setLabelName] = useState(initialName ?? "");
  const [preview, setPreview] = useState(initialLogoUrl);
  const [clearLogo, setClearLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="space-y-4 rounded-xl border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved(false);
        try {
          const form = e.currentTarget;
          const data = new FormData();
          data.set("labelName", labelName);
          if (clearLogo) data.set("clearLogo", "1");
          const fileInput = form.elements.namedItem("logo") as HTMLInputElement;
          await appendPreparedAvatar(data, fileInput?.files?.[0]);
          // appendPreparedAvatar uses "photo" — rename to "logo" for the API
          const photo = data.get("photo");
          if (photo instanceof File) {
            data.delete("photo");
            data.set("logo", photo);
          }
          const res = await fetch("/api/label/branding", { method: "PATCH", body: data });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Could not save branding");
          setLabelName(json.user.labelName ?? "");
          setPreview(json.user.labelLogoUrl);
          setClearLogo(false);
          if (fileInput) fileInput.value = "";
          setSaved(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save branding");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <p className="type-section">Label branding</p>
        <p className="mt-1 text-sm text-mute">
          Shown on your project feed and staff invites. Separate from your personal profile ({personalName}).
        </p>
      </div>

      <div className="flex items-center gap-4">
        {preview && !clearLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-2 text-lg text-mute">
            {(labelName || personalName).slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <label className="block space-y-1 text-sm">
            <span className="text-mute">Logo</span>
            <input
              name="logo"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setClearLogo(false);
                setPreview(URL.createObjectURL(file));
              }}
              className="w-full text-xs text-mute"
            />
          </label>
          {preview && !clearLogo && (
            <button
              type="button"
              onClick={() => {
                setClearLogo(true);
                setPreview(null);
              }}
              className="text-xs text-mute hover:text-rose-300"
            >
              Remove logo
            </button>
          )}
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-mute">Label name</span>
        <input
          value={labelName}
          onChange={(e) => setLabelName(e.target.value)}
          placeholder={personalName}
          className="w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-brass"
        />
      </label>

      {error && <p className="text-sm text-rose-300">{error}</p>}
      {saved && !error && <p className="text-sm text-emerald-300">Branding saved.</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-brass px-4 py-2 text-sm font-medium text-bg disabled:opacity-40"
      >
        Save branding
      </button>
    </form>
  );
}
