import type { User, UserRole } from "@/generated/prisma/client";

export type SessionUser = {
  id: string;
  loginId: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  version: number;
};

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    loginId: user.loginId,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    version: user.version,
  };
}
