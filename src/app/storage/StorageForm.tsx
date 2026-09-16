"use client";

import { useEffect, useState } from "react";

type Settings = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  cdnHost: string;
  hasSecret: boolean;
  configured: boolean;
};

const empty: Settings = {
  endpoint: "",
  region: "",
  bucket: "",
  accessKey: "",
  cdnHost: "",
  hasSecret: false,
  configured: false,
};

export function StorageForm({ origin }: { origin: string }) {
  const [form, setForm] = useState(empty);
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [tested, setTested] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveOrigin, setLiveOrigin] = useState(origin);
  const [corsManual, setCorsManual] = useState(false);

  useEffect(() => {
    setLiveOrigin(window.location.origin);
    void fetch("/api/settings/storage")
      .then(async (res) => {
        const json = await res.json();
        if (res.ok) setForm(json);
      })
      .catch(() => undefined);
    void fetch("/api/storage/status")
      .then(async (res) => {
        const json = (await res.json()) as { corsManual?: boolean };
        if (res.ok && json.corsManual) setCorsManual(true);
      })
      .catch(() => undefined);
  }, []);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setTested("");
  }

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setSaved(false);
        setTested("");
        const res = await fetch("/api/settings/storage", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: form.endpoint,
            region: form.region,
            bucket: form.bucket,
            accessKey: form.accessKey,
            secretKey,
            cdnHost: form.cdnHost,
            origin: window.location.origin,
          }),
        });
        const json = await res.json();
        setBusy(false);
        if (!res.ok) {
          setError(json.error ?? "Could not save");
          return;
        }
        setForm(json);
        setSecretKey("");
        setSaved(true);
        setCorsManual(Boolean(json.corsManual));
        if (json.corsManual) {
          setError(
            "Keys saved, but this Spaces key cannot change CORS (Access Denied). Paste the rule below in DigitalOcean.",
          );
        }
      }}
    >
      <label className="block space-y-1">
        <span className="text-sm text-mute">Endpoint</span>
        <input
          value={form.endpoint}
          onChange={(e) => update("endpoint", e.target.value)}
          placeholder="https://fra1.digitaloceanspaces.com"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-mute">Region</span>
        <input
          value={form.region}
          onChange={(e) => update("region", e.target.value)}
          placeholder="fra1"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-mute">Bucket</span>
        <input
          value={form.bucket}
          onChange={(e) => update("bucket", e.target.value)}
          placeholder="audio-review"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-mute">Access key</span>
        <input
          value={form.accessKey}
          onChange={(e) => update("accessKey", e.target.value)}
          autoComplete="off"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
          required
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-mute">Secret key</span>
        <input
          type="password"
          value={secretKey}
          onChange={(e) => {
            setSecretKey(e.target.value);
            setSaved(false);
            setTested("");
          }}
          placeholder={form.hasSecret ? "Leave blank to keep the saved key" : ""}
          autoComplete="new-password"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm text-mute">CDN host (optional)</span>
        <input
          value={form.cdnHost}
          onChange={(e) => update("cdnHost", e.target.value)}
          placeholder="https://audio-review.fra1.cdn.digitaloceanspaces.com"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brass"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brass px-4 py-2 text-sm font-medium text-bg hover:brightness-110 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-line px-4 py-2 text-sm text-mute hover:border-brass hover:text-ink disabled:opacity-40"
          onClick={async () => {
            setBusy(true);
            setError("");
            setTested("");
            const res = await fetch("/api/settings/storage/test", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                endpoint: form.endpoint,
                region: form.region,
                bucket: form.bucket,
                accessKey: form.accessKey,
                secretKey,
                cdnHost: form.cdnHost,
                origin: window.location.origin,
              }),
            });
            const json = await res.json();
            setBusy(false);
            if (!res.ok) {
              setError(json.error ?? "Connection failed");
              return;
            }
            setCorsManual(Boolean(json.corsManual));
            if (json.corsManual) {
              setTested("Connected to Spaces.");
              setError(
                "This Spaces key cannot change CORS (Access Denied). Set CORS in the DigitalOcean control panel using the steps below.",
              );
            } else {
              setTested("Connected. CORS applied for this computer.");
            }
          }}
        >
          Test connection
        </button>
      </div>
      {saved && !corsManual && (
        <p className="text-sm text-emerald-300">Storage settings saved. CORS was applied for {liveOrigin}.</p>
      )}
      {saved && corsManual && <p className="text-sm text-emerald-300">Storage settings saved.</p>}
      {tested && <p className="text-sm text-emerald-300">{tested}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {form.configured && (
        <p className="text-xs text-mute">Spaces is on. New audio uploads go to the bucket; playback streams from there.</p>
      )}

      <section className="space-y-2 rounded-lg border border-brass/40 bg-brass-dim/20 p-3">
        <h2 className="text-sm font-medium">Required: Spaces CORS</h2>
        <p className="text-xs text-mute">
          DigitalOcean’s CORS UI is a form (not a JSON paste). Your Spaces key cannot set this via API, so configure it
          once in the control panel:
        </p>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-mute">
          <li>
            Open DigitalOcean → Spaces Object Storage → bucket{" "}
            <span className="text-ink">{form.bucket || "audio-review"}</span>
          </li>
          <li>Settings → CORS Configurations → Add</li>
          <li>
            Origin: <span className="text-ink">{liveOrigin}</span> (also add <span className="text-ink">http://127.0.0.1:3001</span>{" "}
            if you use that)
          </li>
          <li>Allowed Methods: check GET, PUT, HEAD, POST</li>
          <li>
            Allowed Headers: enter <span className="text-ink">*</span>
          </li>
          <li>Access Control Max Age: <span className="text-ink">5</span> (while testing)</li>
          <li>Save. If Spaces CDN is enabled, purge the CDN cache after saving CORS.</li>
          <li>Hard-refresh this app, then upload a track again</li>
        </ol>
        <p className="text-xs text-mute">
          Advanced (s3cmd / XML) alternative if the form does not work:
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-[11px] text-mute">{`<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    <AllowedOrigin>${liveOrigin}</AllowedOrigin>
    <AllowedOrigin>http://127.0.0.1:3001</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>5</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`}</pre>
      </section>
    </form>
  );
}
