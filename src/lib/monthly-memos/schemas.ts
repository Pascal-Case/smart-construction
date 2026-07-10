import { z } from "zod";

export const memoKeySchema = z.object({
  siteId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월은 YYYY-MM 형식이어야 합니다."),
});
export const saveMemoSchema = memoKeySchema.extend({
  content: z.string().max(5000, "메모는 5,000자 이하여야 합니다."),
  version: z.number().int().positive().nullable().optional(),
});
