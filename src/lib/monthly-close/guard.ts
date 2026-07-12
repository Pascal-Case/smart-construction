import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { AuthError } from "@/lib/auth/errors";

type MonthTarget = { siteId: string; months: string[] };

export async function assertMonthsOpen(tx: Prisma.TransactionClient, targets: MonthTarget[]) {
  const grouped = new Map<string, Set<string>>();
  for (const target of targets) {
    if (!target.siteId) continue;
    const months = grouped.get(target.siteId) ?? new Set<string>();
    for (const month of target.months) if (month) months.add(month);
    grouped.set(target.siteId, months);
  }
  const OR = [...grouped.entries()]
    .filter(([, months]) => months.size > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([siteId, months]) => ({ siteId, month: { in: [...months].sort() } }));
  if (!OR.length) return;
  const closed = await tx.monthlyClose.findMany({
    where: { state: "CLOSED", OR },
    select: { siteId: true, month: true },
    orderBy: [{ month: "asc" }, { siteId: "asc" }],
    take: 1,
  });
  if (closed[0]) {
    throw new AuthError(
      "마감된 월은 변경할 수 없습니다. 관리자에게 재개방을 요청해 주세요.",
      409,
      "MONTH_CLOSED",
    );
  }
}
