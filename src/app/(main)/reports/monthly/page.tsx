import { MonthlyReport, type MonthlyReportData } from "@/components/reports/monthly-report";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMonthlyReport } from "@/lib/reports/monthly";

export default async function MonthlyReportPage() {
  const user = await getCurrentUser(); const currentMonth = new Date().toISOString().slice(0, 7);
  const [initialData, sites] = await Promise.all([getMonthlyReport({ startMonth: currentMonth, endMonth: currentMonth, siteId: "" }), prisma.site.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  return <div className="mx-auto max-w-[1600px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">월별 집계</p><h1 className="text-2xl font-semibold">월별 현황과 메모</h1><p className="mt-1 text-sm text-muted-foreground">현장별 청구액을 비교하고 금액 상세와 공유 메모를 확인합니다.</p></div><MonthlyReport initialData={initialData satisfies MonthlyReportData} sites={sites} canEdit={user?.role === "ADMIN" || user?.role === "MANAGER"} /></div>;
}
