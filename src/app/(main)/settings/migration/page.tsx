import { redirect } from "next/navigation";

import { MigrationManager } from "@/components/migration/migration-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { listLegacyMigrationHistory } from "@/lib/migration/service";

export default async function MigrationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  const history = await listLegacyMigrationHistory();
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">설정</p><h1 className="text-2xl font-semibold">기존 데이터 이관</h1><p className="mt-1 text-sm text-muted-foreground">기존 HTML localStorage JSON과 계약 Excel을 미리 검증하고 한 번에 이관합니다.</p></div><MigrationManager initialHistory={history} /></div>;
}
