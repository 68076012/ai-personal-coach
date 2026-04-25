import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";
import type { UserId } from "@/lib/db/schema";

export type SessionData = {
  userId?: UserId;
};

const REQUIRED_LEN = 32;

export function getSessionOptions(): SessionOptions {
  const password = process.env.AUTH_SECRET;
  if (!password || password.length < REQUIRED_LEN) {
    throw new Error(
      `AUTH_SECRET must be at least ${REQUIRED_LEN} characters. Set it in .env.local.`,
    );
  }
  return {
    password,
    cookieName: "coach_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession() {
  const c = await cookies();
  return getIronSession<SessionData>(c, getSessionOptions());
}

export async function requireUserId(): Promise<UserId> {
  const session = await getSession();
  if (!session.userId) {
    throw new Error("UNAUTHENTICATED");
  }
  return session.userId;
}

export const ALLOWED_USERS: { id: UserId }[] = [
  { id: "garfield" },
  { id: "partner" },
  { id: "test" },
];

export function isAllowedUser(userId: string): userId is UserId {
  return ALLOWED_USERS.some((u) => u.id === userId);
}
