import { z } from "zod";

const nullableText = z.string().trim().max(500).optional().nullable();
const code = z.string().trim().max(30).regex(/^[A-Za-z0-9._-]+$/, "계약번호는 영문, 숫자, . _ -만 사용할 수 있습니다.");
const money = z.number().int().min(0).max(2_000_000_000);

export const contractLineInputSchema = z.object({
  id: z.string().min(1).optional(),
  itemId: z.string().min(1, "품목을 선택해 주세요."),
  description: nullableText,
  quantity: z.number().positive("수량은 0보다 커야 합니다.").max(1_000_000),
  appliedSalesPrice: money,
  appliedCostPrice: money,
  priceOverrideReason: nullableText,
  revenueStartDate: z.iso.date(),
  revenueEndDate: z.iso.date(),
});

export const contractInputSchema = z.object({
  contractNo: z.union([code, z.literal("")]).optional(),
  siteId: z.string().min(1, "현장을 선택해 주세요."),
  title: z.string().trim().min(1, "계약명을 입력해 주세요.").max(100),
  status: z.enum(["DRAFT", "ACTIVE", "ENDED", "CANCELED"]),
  memo: nullableText,
  lines: z.array(contractLineInputSchema).min(1, "계약 품목을 한 개 이상 입력해 주세요.").max(100),
}).superRefine((value, context) => {
  const ids = value.lines.flatMap((line) => line.id ? [line.id] : []);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "같은 계약 품목 행이 중복되었습니다.", path: ["lines"] });
  value.lines.forEach((line, index) => {
    if (line.revenueStartDate > line.revenueEndDate) context.addIssue({ code: "custom", message: "매출 종료일은 시작일보다 빠를 수 없습니다.", path: ["lines", index, "revenueEndDate"] });
  });
});

export const contractUpdateSchema = contractInputSchema.and(z.object({ version: z.number().int().positive() }));

export const contractListQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["all", "DRAFT", "ACTIVE", "ENDED", "CANCELED"]).default("all"),
  siteId: z.string().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});

export type ContractInput = z.infer<typeof contractInputSchema>;
export type ContractListQuery = z.infer<typeof contractListQuerySchema>;
