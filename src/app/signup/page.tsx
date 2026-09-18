import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/projects");

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div>
          <p className="text-xs tracking-[0.25em] text-brass uppercase">Audio Review</p>
          <h1 className="mt-2 text-3xl font-medium">Create account</h1>
          <p className="mt-2 text-sm text-mute">
            Free accounts join invites and upload on shared projects. A subscription lets you create projects and invite
            collaborators.
          </p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-mute">
          Already have an account?{" "}
          <Link href="/login" className="text-brass hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
