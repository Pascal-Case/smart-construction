import { z } from "zod";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월은 YYYY-MM 형식이어야 합니다.");
export const monthlyReportQuerySchema = z.object({
  startMonth: month,
  endMonth: month,
  siteId: z.string().default(""),
}).superRefine((value, context) => {
  if (value.startMonth > value.endMonth) context.addIssue({ code: "custom", message: "종료월은 시작월보다 빠를 수 없습니다.", path: ["endMonth"] });
  if (enumerateMonths(value.startMonth, value.endMonth).length > 24) context.addIssue({ code: "custom", message: "한 번에 최대 24개월까지 조회할 수 있습니다.", path: ["endMonth"] });
});

export function enumerateMonths(startMonth: string, endMonth: string) {
  const [startYear, startIndex] = startMonth.split("-").map(Number); const [endYear, endIndex] = endMonth.split("-").map(Number);
  const result: string[] = [];
  for (const cursor = new Date(Date.UTC(startYear, startIndex - 1, 1)), end = new Date(Date.UTC(endYear, endIndex - 1, 1)); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) result.push(cursor.toISOString().slice(0, 7));
  return result;
}
