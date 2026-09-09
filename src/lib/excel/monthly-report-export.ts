import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createMonthlyReportWorkbook, type MonthlyReportMetric } from "@/lib/excel/monthly-report-workbook";
import { getMonthlyReport } from "@/lib/reports/monthly";
import type { monthlyReportQuerySchema } from "@/lib/reports/monthly-query";
import type { z } from "zod";

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function exportMonthlyReportWorkbook(query: z.infer<typeof monthlyReportQuerySchema>, metric: MonthlyReportMetric) {
  const [report, site, contractCategory] = await Promise.all([
    getMonthlyReport(query),
    query.siteId ? prisma.site.findUnique({ where: { id: query.siteId }, select: { name: true } }) : null,
    query.contractCategoryId ? prisma.contractCategory.findUnique({ where: { id: query.contractCategoryId }, select: { name: true } }) : null,
  ]);
  const buffer = await createMonthlyReportWorkbook({ report, metric, filter: { siteName: site?.name ?? "전체", contractCategoryName: contractCategory?.name ?? "전체", generatedAt: new Date() } });
  const filename = `월별현황_${query.startMonth}_${query.endMonth}_${metric}.xlsx`;
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": MIME, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "Cache-Control": "no-store" } });
}
