import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/projects");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <p className="text-xs tracking-[0.25em] text-brass uppercase">Audio Review</p>
          <h1 className="mt-2 text-3xl font-medium">Sign in</h1>
          <p className="mt-2 text-sm text-mute">Create projects, upload versions, and share a review link.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
