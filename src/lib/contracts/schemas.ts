import { z } from "zod";

const nullableText = z.string().trim().max(500).optional().nullable();
const code = z.string().trim().max(30).regex(/^[A-Za-z0-9._-]+$/, "계약번호는 영문, 숫자, . _ -만 사용할 수 있습니다.");
const money = z.number().int().min(0).max(2_000_000_000);
const billingPeriod = z.union([
  z.iso.date(),
  z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월은 YYYY-MM 형식으로 입력해 주세요."),
]);

export const contractLineInputSchema = z.object({
  id: z.string().min(1).optional(),
  itemId: z.string().min(1, "품목을 선택해 주세요."),
  description: nullableText,
  billingMethod: z.enum(["MONTHLY_RECURRING", "PRORATED_TOTAL"]).optional(),
  quantity: z.number().positive("수량은 0보다 커야 합니다.").max(1_000_000),
  appliedSalesPrice: money,
  appliedCostPrice: money,
  priceOverrideReason: nullableText,
  revenueStartDate: billingPeriod,
  revenueEndDate: billingPeriod,
});

const contractInputBaseSchema = z.object({
  contractNo: z.union([code, z.literal("")]).optional(),
  siteId: z.string().min(1, "현장을 선택해 주세요."),
  title: z.string().trim().min(1, "계약명을 입력해 주세요.").max(100),
  status: z.enum(["DRAFT", "ACTIVE", "ENDED", "CANCELED"]),
  memo: nullableText,
  lines: z.array(contractLineInputSchema).min(1, "계약 품목을 한 개 이상 입력해 주세요.").max(100),
});

function rejectDuplicateLineIds(value: { lines: Array<{ id?: string }> }, context: z.RefinementCtx) {
  const ids = value.lines.flatMap((line) => line.id ? [line.id] : []);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "같은 계약 품목 행이 중복되었습니다.", path: ["lines"] });
}

export const contractInputSchema = contractInputBaseSchema.superRefine(rejectDuplicateLineIds);
export const contractCreateInputSchema = contractInputBaseSchema.omit({ contractNo: true }).superRefine(rejectDuplicateLineIds);

export const contractUpdateSchema = contractInputSchema.and(z.object({ version: z.number().int().positive() }));

export const contractSortKeys = ["contractNo", "title", "site", "period", "itemCount", "baseAmount", "status", "updatedAt"] as const;

export const contractListQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["all", "DRAFT", "ACTIVE", "ENDED", "CANCELED"]).default("all"),
  siteId: z.string().default(""),
  sort: z.enum(contractSortKeys).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});

export const contractRevenueCandidateQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  siteId: z.string().default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(50).default(20),
});

export type ContractInput = z.infer<typeof contractInputSchema>;
export type ContractCreateInput = z.infer<typeof contractCreateInputSchema>;
export type ContractListQuery = z.infer<typeof contractListQuerySchema>;
export type ContractSortKey = ContractListQuery["sort"];
export type ContractRevenueCandidateQuery = z.infer<typeof contractRevenueCandidateQuerySchema>;
