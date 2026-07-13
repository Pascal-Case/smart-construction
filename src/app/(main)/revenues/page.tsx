import { RevenueManager, type RevenueList } from "@/components/revenues/revenue-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parseExplicitSort } from "@/lib/list-sorting";
import { revenueListQuerySchema, revenueSortKeys } from "@/lib/revenues/schemas";
import { listRevenues } from "@/lib/revenues/service";

export default async function RevenuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  const rawQuery = await searchParams;
  const parsedQuery = revenueListQuerySchema.safeParse(rawQuery);
  const query = parsedQuery.success ? parsedQuery.data : revenueListQuerySchema.parse({});
  const params = new URLSearchParams(Object.entries(rawQuery).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  const initialSort = parseExplicitSort(params, revenueSortKeys);
  const [result, sites, items] = await Promise.all([
    listRevenues(query),
    prisma.site.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ select: { id: true, name: true, unit: true, standardSalesPrice: true, standardCostPrice: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const initialData: RevenueList = { ...result, rows: result.rows.map((row) => ({ ...row, revenueDate: row.revenueDate.toISOString(), updatedAt: row.updatedAt.toISOString() })) };
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">매출·청구</p><h1 className="text-2xl font-semibold">매출 원장</h1><p className="mt-1 text-sm text-muted-foreground">계약 자동 매출과 자유형·조정 매출을 건별 이력으로 관리합니다.</p></div><RevenueManager initialData={initialData} initialFilters={query} initialSort={initialSort} sites={sites} items={items} canEdit={user?.role === "ADMIN" || user?.role === "MANAGER"} /></div>;
}
