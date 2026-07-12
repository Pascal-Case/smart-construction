import { CalendarCheck2 } from "lucide-react";
import Link from "next/link";

import { MonthlyReport, type MonthlyReportData } from "@/components/reports/monthly-report";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMonthlyReport } from "@/lib/reports/monthly";
import { currentYearMonthRange } from "@/lib/reports/monthly-query";

export default async function MonthlyReportPage() {
  const user = await getCurrentUser(); const range = currentYearMonthRange();
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [initialData, sites, items] = await Promise.all([
    getMonthlyReport({ ...range, siteId: "" }),
    prisma.site.findMany({ where: { isActive: true }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
    canEdit ? prisma.item.findMany({ where: { isActive: true }, select: { id: true, name: true, unit: true, standardSalesPrice: true, standardCostPrice: true, isActive: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  return <div className="mx-auto max-w-[1600px] space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-teal-700">월별 집계</p><h1 className="text-2xl font-semibold">월별 현황과 메모</h1><p className="mt-1 text-sm text-muted-foreground">현장별 청구액을 비교하고 금액 상세와 공유 메모를 확인합니다.</p></div><Button variant="outline" nativeButton={false} render={<Link href="/reports/monthly/close" />}><CalendarCheck2 data-icon="inline-start" />월마감</Button></div><MonthlyReport initialData={initialData satisfies MonthlyReportData} sites={sites} items={items} canEdit={canEdit} currentUserId={user?.id ?? ""} /></div>;
}
