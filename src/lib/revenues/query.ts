import type { Prisma } from "@/generated/prisma/client";
import type { RevenueListQuery } from "@/lib/revenues/schemas";

export function buildRevenueWhere(query: RevenueListQuery): Prisma.RevenueEntryWhereInput {
  return {
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.sourceType !== "all" ? { sourceType: query.sourceType } : {}),
    ...(query.status !== "all" ? { status: query.status } : {}),
    ...(query.exception === "ZERO" ? { AND: [{ salesAmount: 0 }, { status: { not: "CANCELED" } }] } : {}),
    ...(query.startDate || query.endDate ? { revenueDate: {
      ...(query.startDate ? { gte: dbDate(query.startDate) } : {}),
      ...(query.endDate ? { lte: dbDate(query.endDate) } : {}),
    } } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q } }, { description: { contains: query.q } }, { site: { name: { contains: query.q } } }, { item: { name: { contains: query.q } } }] } : {}),
  };
}

function dbDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
