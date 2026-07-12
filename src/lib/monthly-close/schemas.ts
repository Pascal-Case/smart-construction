import { z } from "zod";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월은 YYYY-MM 형식이어야 합니다.");
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/i, "상태 fingerprint가 올바르지 않습니다.");
const reasonSchema = z.string().trim().min(1, "사유를 입력해 주세요.").max(500, "사유는 500자 이하여야 합니다.");

export const monthlyCloseQuerySchema = z.object({
  month: monthSchema,
  siteId: z.string().default(""),
  view: z.enum(["exceptions", "all"]).default("exceptions"),
});

export const reviewMonthlyCloseExceptionSchema = z.object({
  siteId: z.string().min(1),
  month: monthSchema,
  exceptionKey: z.string().trim().min(1).max(200),
  expectedFingerprint: fingerprintSchema,
  reason: reasonSchema,
});

export const closeMonthlySitesSchema = z.object({
  month: monthSchema,
  targets: z.array(z.object({
    siteId: z.string().min(1),
    expectedFingerprint: fingerprintSchema,
  })).min(1, "마감할 현장을 선택해 주세요.").max(500, "한 번에 최대 500개 현장을 마감할 수 있습니다."),
}).superRefine((value, context) => {
  const ids = value.targets.map((target) => target.siteId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "중복된 현장이 포함되어 있습니다.", path: ["targets"] });
  }
});

export const reopenMonthlyCloseSchema = z.object({
  expectedVersion: z.number().int().positive(),
  latestCycleId: z.string().min(1),
  reason: reasonSchema,
});

export type MonthlyCloseQuery = z.infer<typeof monthlyCloseQuerySchema>;
export type ReviewMonthlyCloseExceptionInput = z.infer<typeof reviewMonthlyCloseExceptionSchema>;
export type CloseMonthlySitesInput = z.infer<typeof closeMonthlySitesSchema>;
export type ReopenMonthlyCloseInput = z.infer<typeof reopenMonthlyCloseSchema>;
