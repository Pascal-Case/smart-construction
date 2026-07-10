import "server-only";

import { prisma } from "@/lib/db/prisma";
import { enumerateMonths, monthlyReportQuerySchema } from "@/lib/reports/monthly-query";
import type { z } from "zod";

export { monthlyReportQuerySchema } from "@/lib/reports/monthly-query";

export async function getMonthlyReport(input: z.infer<typeof monthlyReportQuerySchema>) {
  const months = enumerateMonths(input.startMonth, input.endMonth);
  const startDate = new Date(`${input.startMonth}-01T00:00:00.000Z`);
  const [endYear, endMonth] = input.endMonth.split("-").map(Number);
  const endDate = new Date(Date.UTC(endYear, endMonth, 0, 23, 59, 59, 999));
  const [sites, entries, memos] = await prisma.$transaction([
    prisma.site.findMany({ where: input.siteId ? { id: input.siteId } : { OR: [{ isActive: true }, { revenueEntries: { some: { revenueDate: { gte: startDate, lte: endDate } } } }, { monthlyMemos: { some: { month: { in: months } } } }] }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.revenueEntry.findMany({ where: { ...(input.siteId ? { siteId: input.siteId } : {}), revenueDate: { gte: startDate, lte: endDate }, status: { not: "CANCELED" } }, select: { id: true, siteId: true, revenueDate: true, sourceType: true, status: true, title: true, quantity: true, unit: true, appliedSalesPrice: true, salesAmount: true, costAmount: true, item: { select: { name: true } } }, orderBy: [{ revenueDate: "asc" }, { createdAt: "asc" }] }),
    prisma.monthlyMemo.findMany({ where: { ...(input.siteId ? { siteId: input.siteId } : {}), month: { in: months } }, select: { siteId: true, month: true } }),
  ]);
  const memoKeys = new Set(memos.map((memo) => `${memo.siteId}:${memo.month}`));
  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) { const key = `${entry.siteId}:${entry.revenueDate.toISOString().slice(0, 7)}`; grouped.set(key, [...(grouped.get(key) ?? []), entry]); }
  const rows = sites.map((site) => {
    const cells = months.map((monthKey) => {
      const detailRows = grouped.get(`${site.id}:${monthKey}`) ?? [];
      const salesAmount = detailRows.reduce((sum, row) => sum + row.salesAmount, 0);
      const costAmount = detailRows.reduce((sum, row) => sum + (row.costAmount ?? 0), 0);
      return { month: monthKey, salesAmount, costAmount, profit: salesAmount - costAmount, count: detailRows.length, draftCount: detailRows.filter((row) => row.status === "DRAFT").length, zeroAmountCount: detailRows.filter((row) => row.salesAmount === 0).length, hasMemo: memoKeys.has(`${site.id}:${monthKey}`), details: detailRows.map((row) => ({ ...row, revenueDate: row.revenueDate.toISOString(), itemName: row.item?.name ?? null, item: undefined })) };
    });
    return { ...site, cells, totals: sumCells(cells) };
  });
  return { startMonth: input.startMonth, endMonth: input.endMonth, months, rows, monthTotals: months.map((monthKey, index) => ({ month: monthKey, ...sumCells(rows.map((row) => row.cells[index]) ) })), grandTotals: sumCells(rows.flatMap((row) => row.cells)) };
}

type Summary = { salesAmount: number; costAmount: number; profit: number; count: number; draftCount: number; zeroAmountCount: number };
function sumCells(cells: Array<Summary | undefined>): Summary { return cells.reduce<Summary>((sum, cell) => ({ salesAmount: sum.salesAmount + (cell?.salesAmount ?? 0), costAmount: sum.costAmount + (cell?.costAmount ?? 0), profit: sum.profit + (cell?.profit ?? 0), count: sum.count + (cell?.count ?? 0), draftCount: sum.draftCount + (cell?.draftCount ?? 0), zeroAmountCount: sum.zeroAmountCount + (cell?.zeroAmountCount ?? 0) }), { salesAmount: 0, costAmount: 0, profit: 0, count: 0, draftCount: 0, zeroAmountCount: 0 }); }
