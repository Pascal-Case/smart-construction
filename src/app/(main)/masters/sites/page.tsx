import { MasterManager, type MasterList, type SiteView } from "@/components/masters/master-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { listSites } from "@/lib/masters/site-service";

export default async function SitesPage() {
  const user = await getCurrentUser();
  const result = await listSites({ q: "", status: "active", sort: "name", order: "asc", page: 1, pageSize: 20 });
  const initialData: MasterList<SiteView> = { ...result, rows: result.rows.map((row) => ({ ...row, startDate: row.startDate?.toISOString() ?? null, endDate: row.endDate?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })) };
  return <div className="mx-auto max-w-[1400px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">기초 데이터</p><h1 className="text-2xl font-semibold">현장 마스터</h1><p className="mt-1 text-sm text-muted-foreground">현장 정보와 업무에서 사용하는 별칭을 관리합니다.</p></div><MasterManager type="site" initialData={initialData} canEdit={user?.role === "ADMIN" || user?.role === "MANAGER"} /></div>;
}
