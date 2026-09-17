import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findUserById, normalizeUserRole } from "@/lib/data";
import type { PlanLabel, UserRole } from "@/lib/types";

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
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

export function canCreateProjects(user: Pick<SessionUser, "role" | "subscribed">) {
  return user.role === "superadmin" || user.subscribed;
}

export function planLabel(user: Pick<SessionUser, "role" | "subscribed">): PlanLabel {
  if (user.role === "superadmin") return "Superadmin";
  if (user.subscribed) return "Subscriber";
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
  return {
    userId: user.id,
    email: user.email,
    name: user.name || user.email.split("@")[0],
    role: normalizeUserRole(user.role),
    subscribed: Boolean(user.subscribed) || normalizeUserRole(user.role) === "superadmin",
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
