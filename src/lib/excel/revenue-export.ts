import "server-only";

import { AuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/db/prisma";
import { createRevenueWorkbook, REVENUE_EXPORT_LIMIT } from "@/lib/excel/revenue-workbook";
import { buildRevenueWhere } from "@/lib/revenues/query";
import type { RevenueListQuery } from "@/lib/revenues/schemas";

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SOURCE_LABELS = { all: "전체", CONTRACT: "계약", MANUAL: "직접", ADJUSTMENT: "조정" } as const;
const STATUS_LABELS = { all: "전체", DRAFT: "작성 중", CONFIRMED: "확정", CANCELED: "취소" } as const;

export async function exportRevenueWorkbook(query: RevenueListQuery) {
  const where = buildRevenueWhere(query);
  const total = await prisma.revenueEntry.count({ where });
  if (total > REVENUE_EXPORT_LIMIT) {
    throw new AuthError(`Excel은 한 번에 최대 ${REVENUE_EXPORT_LIMIT.toLocaleString()}건까지 내보낼 수 있습니다. 기간이나 현장을 좁혀 주세요.`, 413, "EXPORT_TOO_LARGE");
  }

  const memoMonth = {
    ...(query.startDate ? { gte: query.startDate.slice(0, 7) } : {}),
    ...(query.endDate ? { lte: query.endDate.slice(0, 7) } : {}),
  };
  const [details, memos, selectedSite] = await prisma.$transaction([
    prisma.revenueEntry.findMany({
      where,
      select: {
        id: true,
        revenueDate: true,
        sourceType: true,
        status: true,
        title: true,
        description: true,
        quantity: true,
        unit: true,
        appliedSalesPrice: true,
        salesAmount: true,
        appliedCostPrice: true,
        costAmount: true,
        priceOverrideReason: true,
        createdById: true,
        createdAt: true,
        site: { select: { code: true, name: true } },
        item: { select: { name: true } },
        contract: { select: { contractNo: true } },
      },
      orderBy: [{ revenueDate: "asc" }, { site: { name: "asc" } }, { createdAt: "asc" }],
    }),
    prisma.monthlyMemo.findMany({
      where: {
        ...(query.siteId ? { siteId: query.siteId } : {}),
        ...(Object.keys(memoMonth).length ? { month: memoMonth } : {}),
      },
      select: { month: true, content: true, updatedById: true, updatedAt: true, site: { select: { code: true, name: true } } },
      orderBy: [{ month: "asc" }, { site: { name: "asc" } }],
    }),
    prisma.site.findFirst({ where: query.siteId ? { id: query.siteId } : { id: "__all_sites__" }, select: { name: true } }),
  ]);

  const userIds = [...new Set([...details.map((row) => row.createdById), ...memos.map((row) => row.updatedById)])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const generatedAt = new Date();
  const buffer = await createRevenueWorkbook({
    details: details.map((row) => ({
      id: row.id,
      revenueDate: row.revenueDate,
      siteCode: row.site.code,
      siteName: row.site.name,
      sourceType: row.sourceType,
      status: row.status,
      contractNo: row.contract?.contractNo ?? null,
      itemName: row.item?.name ?? null,
      title: row.title,
      description: row.description,
      quantity: row.quantity,
      unit: row.unit,
      appliedSalesPrice: row.appliedSalesPrice,
      salesAmount: row.salesAmount,
      appliedCostPrice: row.appliedCostPrice,
      costAmount: row.costAmount,
      priceOverrideReason: row.priceOverrideReason,
      createdByName: userNames.get(row.createdById) ?? "알 수 없음",
      createdAt: row.createdAt,
    })),
    memos: memos.map((row) => ({ month: row.month, siteCode: row.site.code, siteName: row.site.name, content: row.content, updatedByName: userNames.get(row.updatedById) ?? "알 수 없음", updatedAt: row.updatedAt })),
    filter: { startDate: query.startDate, endDate: query.endDate, siteName: selectedSite?.name ?? "전체", sourceLabel: SOURCE_LABELS[query.sourceType], statusLabel: STATUS_LABELS[query.status], query: query.q, generatedAt },
  });

  const rangeLabel = `${query.startDate || "전체"}_${query.endDate || "전체"}`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`매출현황_${rangeLabel}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
