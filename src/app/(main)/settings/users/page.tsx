import { redirect } from "next/navigation";

import { UsersManager, type ManagedUserView } from "@/components/users/users-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/user-service";

export default async function UsersPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.role !== "ADMIN") redirect("/");
  const users = (await listUsers()).map((user) => ({ ...user, lastLoginAt: user.lastLoginAt?.toISOString() ?? null, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() })) satisfies ManagedUserView[];
  return <div className="mx-auto max-w-6xl space-y-6"><div><p className="text-sm font-semibold text-teal-700">설정</p><h1 className="text-2xl font-semibold">사용자 관리</h1><p className="mt-1 text-sm text-muted-foreground">계정, 역할, 사용 상태를 관리합니다.</p></div><UsersManager initialUsers={users} /></div>;
}
