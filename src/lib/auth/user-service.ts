import "server-only";

import { Prisma, UserRole } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import { toSessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { createUserSchema, loginSchema, setupSchema, updateUserSchema } from "@/lib/auth/schemas";
import { prisma } from "@/lib/db/prisma";
import type { z } from "zod";

type SetupInput = z.infer<typeof setupSchema>;
type LoginInput = z.infer<typeof loginSchema>;
type CreateUserInput = z.infer<typeof createUserSchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;

const userSelect = {
  id: true,
  loginId: true,
  name: true,
  role: true,
  isActive: true,
  version: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export function hasAnyUser() {
  return prisma.user.count().then((count) => count > 0);
}

export async function setupInitialAdmin(input: SetupInput) {
  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.$transaction(async (tx) => {
      if ((await tx.user.count()) > 0) {
        throw new AuthError("초기 설정이 이미 완료되었습니다.", 409, "SETUP_COMPLETED");
      }

      const user = await tx.user.create({
        data: { loginId: input.loginId, name: input.name, passwordHash, role: UserRole.ADMIN },
      });
      await recordAudit(tx, {
        actorId: user.id,
        actorName: user.name,
        action: "SETUP",
        entityType: "USER",
        entityId: user.id,
        after: toSessionUser(user),
      });
      return toSessionUser(user);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthError("이미 사용 중인 아이디입니다.", 409, "DUPLICATE_LOGIN_ID");
    }
    throw error;
  }
}

export async function authenticate(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { loginId: input.loginId } });
  if (!user || !user.isActive || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AuthError("아이디 또는 비밀번호를 확인해 주세요.", 401, "INVALID_CREDENTIALS");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordAudit(tx, {
      actorId: user.id,
      actorName: user.name,
      action: "LOGIN",
      entityType: "SESSION",
      entityId: user.id,
    });
  });
  return toSessionUser(user);
}

export function listUsers() {
  return prisma.user.findMany({ select: userSelect, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
}

export async function createManagedUser(actor: { id: string; name: string }, input: CreateUserInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          loginId: input.loginId,
          name: input.name,
          role: input.role,
          passwordHash,
        },
        select: userSelect,
      });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "USER", entityId: user.id, after: user });
      return user;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthError("이미 사용 중인 아이디입니다.", 409, "DUPLICATE_LOGIN_ID");
    }
    throw error;
  }
}

export async function updateManagedUser(actor: { id: string; name: string }, id: string, input: UpdateUserInput) {
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id }, select: { ...userSelect, passwordHash: true } });
    if (!current) throw new AuthError("사용자를 찾을 수 없습니다.", 404, "USER_NOT_FOUND");

    const removingAdmin = current.role === UserRole.ADMIN && (input.role !== UserRole.ADMIN || !input.isActive);
    if (removingAdmin && (await tx.user.count({ where: { role: UserRole.ADMIN, isActive: true } })) <= 1) {
      throw new AuthError("마지막 활성 관리자는 비활성화하거나 역할을 변경할 수 없습니다.", 409, "LAST_ADMIN");
    }

    const updated = await tx.user.updateMany({
      where: { id, version: input.version },
      data: { name: input.name, role: input.role, isActive: input.isActive, passwordHash, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new AuthError("다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도해 주세요.", 409, "VERSION_CONFLICT");
    const user = await tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    if (!input.isActive) await tx.session.deleteMany({ where: { userId: id } });
    await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "USER", entityId: id, before: { ...current, passwordHash: undefined }, after: user });
    return user;
  });
}
