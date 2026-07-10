import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import type { UserRole } from "@/generated/prisma/client";
import { toSessionUser, type SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { serverEnv } from "@/lib/env/server";

export const SESSION_COOKIE_NAME = "sc_session";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionExpiry() {
  return new Date(Date.now() + serverEnv.SESSION_TTL_HOURS * 60 * 60 * 1000);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry();

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: serverEnv.SESSION_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    return null;
  }

  return toSessionUser(session.user);
}

export async function requireUser(roles?: UserRole[]) {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("로그인이 필요합니다.", 401, "UNAUTHENTICATED");
  if (roles && !roles.includes(user.role)) {
    throw new AuthError("이 작업을 수행할 권한이 없습니다.", 403, "FORBIDDEN");
  }
  return user;
}
