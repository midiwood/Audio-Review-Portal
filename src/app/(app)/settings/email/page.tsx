export const dynamic = "force-dynamic";

export default function SettingsEmailPage() {
  const configured = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
  const from = process.env.EMAIL_FROM?.trim() || null;
  const appUrl = process.env.APP_URL?.trim() || null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Email</h2>
        <p className="mt-1 text-sm text-mute">
          Notification emails are sent via Resend when environment variables are set on the server.
        </p>
      </div>
      <dl className="space-y-3 rounded-xl border border-line bg-surface px-4 py-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-mute">Status</dt>
          <dd className={configured ? "text-emerald-400" : "text-amber-300"}>
            {configured ? "Configured" : "Not configured"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-mute">From</dt>
          <dd className="truncate text-ink">{from ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-mute">APP_URL</dt>
          <dd className="truncate text-ink">{appUrl ?? "—"}</dd>
        </div>
      </dl>
      <p className="text-sm text-mute">
        Set <code className="text-ink">RESEND_API_KEY</code>, <code className="text-ink">EMAIL_FROM</code>, and{" "}
        <code className="text-ink">APP_URL</code> in the Node app environment, then restart the app. Secrets are never
        shown here.
      </p>
    </div>
  );
}
