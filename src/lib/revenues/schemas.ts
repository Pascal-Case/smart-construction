import { z } from "zod";

const nullableText = z.string().trim().max(500).optional().nullable();
const optionalMoney = z.number().int().min(-2_000_000_000).max(2_000_000_000).optional().nullable();

export const revenueInputSchema = z.object({
  siteId: z.string().min(1, "현장을 선택해 주세요."),
  revenueDate: z.iso.date(),
  sourceType: z.enum(["MANUAL", "ADJUSTMENT"]),
  itemId: z.string().optional().nullable(),
  title: z.string().trim().min(1, "매출 제목을 입력해 주세요.").max(100),
  description: nullableText,
  quantity: z.number().positive().max(1_000_000).optional().nullable(),
  unit: z.string().trim().max(30).optional().nullable(),
  appliedSalesPrice: optionalMoney,
  salesAmount: z.number().int().min(-2_000_000_000).max(2_000_000_000),
  appliedCostPrice: optionalMoney,
  costAmount: optionalMoney,
  priceOverrideReason: nullableText,
}).superRefine((value, context) => {
  if ((value.quantity == null) !== (value.appliedSalesPrice == null)) context.addIssue({ code: "custom", message: "수량과 매출단가는 함께 입력해 주세요.", path: ["quantity"] });
  if (value.sourceType === "MANUAL" && value.salesAmount < 0) context.addIssue({ code: "custom", message: "음수 금액은 조정 유형으로 입력해 주세요.", path: ["salesAmount"] });
  if (value.sourceType === "ADJUSTMENT" && !value.priceOverrideReason?.trim()) context.addIssue({ code: "custom", message: "조정 매출에는 사유가 필요합니다.", path: ["priceOverrideReason"] });
  if (value.quantity != null && value.appliedSalesPrice != null && Math.round(value.quantity * value.appliedSalesPrice) !== value.salesAmount && !value.priceOverrideReason?.trim()) context.addIssue({ code: "custom", message: "계산 금액과 다른 직접 금액에는 사유가 필요합니다.", path: ["priceOverrideReason"] });
});

export const revenueUpdateSchema = revenueInputSchema.and(z.object({ version: z.number().int().positive() }));
export const revenueCancelSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(1, "취소 사유를 입력해 주세요.").max(500) });
export const revenueConfirmSchema = z.object({ version: z.number().int().positive() });
export const revenueListQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  startDate: z.union([z.iso.date(), z.literal("")]).default(""),
  endDate: z.union([z.iso.date(), z.literal("")]).default(""),
  siteId: z.string().default(""),
  sourceType: z.enum(["all", "CONTRACT", "MANUAL", "ADJUSTMENT"]).default("all"),
  status: z.enum(["all", "DRAFT", "CONFIRMED", "CANCELED"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: "조회 종료일은 시작일보다 빠를 수 없습니다.", path: ["endDate"] });

export type RevenueInput = z.infer<typeof revenueInputSchema>;
export type RevenueListQuery = z.infer<typeof revenueListQuerySchema>;
