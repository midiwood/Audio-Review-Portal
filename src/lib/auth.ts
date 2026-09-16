import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findUserById } from "@/lib/data";
import type { UserRole } from "@/lib/types";

export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
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
    role: user.role === "admin" ? "admin" : "composer",
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function saveLogin(userId: string) {
  const session = await getSession();
  session.userId = userId;
  await session.save();
}
