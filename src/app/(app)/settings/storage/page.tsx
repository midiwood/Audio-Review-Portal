import { headers } from "next/headers";
import { StorageForm } from "@/app/storage/StorageForm";

export const dynamic = "force-dynamic";

export default async function SettingsStoragePage() {
  const host = (await headers()).get("x-forwarded-host") || (await headers()).get("host") || "localhost:3001";
  const proto = (await headers()).get("x-forwarded-proto") || "http";
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Storage</h2>
        <p className="mt-1 text-sm text-mute">
          Stream and store audio on DigitalOcean Spaces so files do not pass through the web host.
        </p>
      </div>
      <div className="max-w-md">
        <StorageForm origin={origin} />
      </div>
    </div>
  );
}
