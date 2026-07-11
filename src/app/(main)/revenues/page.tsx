import { RevenueManager, type RevenueList } from "@/components/revenues/revenue-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { revenueListQuerySchema } from "@/lib/revenues/schemas";
import { listRevenues } from "@/lib/revenues/service";

export default async function RevenuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  const parsedQuery = revenueListQuerySchema.safeParse(await searchParams);
  const query = parsedQuery.success ? parsedQuery.data : revenueListQuerySchema.parse({});
  const [result, sites, items, contracts] = await Promise.all([
    listRevenues(query),
    prisma.site.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ select: { id: true, name: true, unit: true, standardSalesPrice: true, standardCostPrice: true, isActive: true }, orderBy: { name: "asc" } }),
    prisma.contract.findMany({ where: { status: "ACTIVE" }, select: { id: true, contractNo: true, title: true, site: { select: { name: true } } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const initialData: RevenueList = { ...result, rows: result.rows.map((row) => ({ ...row, revenueDate: row.revenueDate.toISOString() })) };
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">매출·청구</p><h1 className="text-2xl font-semibold">매출 원장</h1><p className="mt-1 text-sm text-muted-foreground">계약 자동 매출과 자유형·조정 매출을 건별 이력으로 관리합니다.</p></div><RevenueManager initialData={initialData} initialFilters={query} sites={sites} items={items} contracts={contracts} canEdit={user?.role === "ADMIN" || user?.role === "MANAGER"} /></div>;
}
