import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findUserById, normalizeAccountPlan, normalizeUserRole } from "@/lib/data";
import type { AccountPlan, PlanLabel, UserRole } from "@/lib/types";

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  plan: AccountPlan;
  /** Set for staff — the label account that owns the project feed. */
  labelId: string | null;
  subscribed: boolean;
};

type SessionData = {
  userId: string;
};

export function getSessionOptions(): SessionOptions {
  const password = process.env.AUTH_SECRET;
  if (!password || password.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return {
    cookieName: "arp_session",
    password,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export function isSuperadmin(user: Pick<SessionUser, "role">) {
  return user.role === "superadmin";
}

export function canCreateProjects(user: Pick<SessionUser, "role" | "plan" | "subscribed">) {
  if (user.role === "superadmin") return true;
  return user.plan === "subscriber" || user.plan === "label" || user.plan === "staff" || user.subscribed;
}

/** Label accounts, and superadmins, who keep label branding and staff on their own account. */
export function isLabelAccount(user: Pick<SessionUser, "plan" | "role">) {
  return user.plan === "label" || user.role === "superadmin";
}

export function isLabelStaff(user: Pick<SessionUser, "plan" | "labelId">) {
  return user.plan === "staff" && Boolean(user.labelId);
}

/** Project owner id for creates — staff create under the label. */
export function projectOwnerIdFor(user: Pick<SessionUser, "userId" | "plan" | "labelId">) {
  if (user.plan === "staff" && user.labelId) return user.labelId;
  return user.userId;
}

export function planLabel(user: Pick<SessionUser, "role" | "plan" | "subscribed">): PlanLabel {
  if (user.role === "superadmin") return "Superadmin";
  if (user.plan === "label") return "Label";
  if (user.plan === "staff") return "Staff";
  if (user.plan === "subscriber" || user.subscribed) return "Subscriber";
  return "Free member";
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session.userId) return null;
  const user = findUserById(session.userId);
  if (!user) return null;
  const role = normalizeUserRole(user.role);
  const plan = role === "superadmin" ? ("subscriber" as const) : normalizeAccountPlan(user.plan, user.subscribed);
  return {
    userId: user.id,
    email: user.email,
    name: user.name || user.email.split("@")[0],
    role,
    plan,
    labelId: plan === "staff" ? user.labelId ?? null : null,
    subscribed: plan !== "free" || role === "superadmin",
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperadmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isSuperadmin(user)) redirect("/projects");
  return user;
}

export async function saveLogin(userId: string) {
  const session = await getSession();
  session.userId = userId;
  await session.save();
}
