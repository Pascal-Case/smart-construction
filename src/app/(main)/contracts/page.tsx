import { ContractManager, type ContractList } from "@/components/contracts/contract-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { listContracts } from "@/lib/contracts/service";
import { prisma } from "@/lib/db/prisma";

export default async function ContractsPage() {
  const user = await getCurrentUser();
  const [result, sites, items] = await Promise.all([
    listContracts({ q: "", status: "all", siteId: "", page: 1, pageSize: 20 }),
    prisma.site.findMany({ select: { id: true, code: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ select: { id: true, code: true, name: true, unit: true, standardSalesPrice: true, standardCostPrice: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const initialData: ContractList = { ...result, rows: result.rows.map((row) => ({ ...row, startDate: row.startDate.toISOString(), endDate: row.endDate.toISOString(), updatedAt: row.updatedAt.toISOString(), lines: row.lines.map((line) => ({ ...line, revenueStartDate: line.revenueStartDate.toISOString(), revenueEndDate: line.revenueEndDate.toISOString() })) })) };
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">계약·단가</p><h1 className="text-2xl font-semibold">계약 관리</h1><p className="mt-1 text-sm text-muted-foreground">현장별 다중 품목 계약과 표준단가 예외를 관리합니다.</p></div><ContractManager initialData={initialData} sites={sites} items={items} canEdit={user?.role === "ADMIN" || user?.role === "MANAGER"} /></div>;
}
