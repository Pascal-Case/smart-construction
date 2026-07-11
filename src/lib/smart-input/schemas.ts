import { z } from "zod";

export const smartInputPreviewSchema = z.object({
  target: z.enum(["CONTRACT", "REVENUE"]),
  input: z.string().trim().min(3, "분석할 문장을 3자 이상 입력해 주세요.").max(1_000, "문장은 1,000자까지 입력할 수 있습니다."),
  selectedSiteId: z.string().trim().min(1).optional(),
  selectedItemId: z.string().trim().min(1).optional(),
});

export const smartInputSuggestionsQuerySchema = z.object({
  q: z.string().trim().min(2, "검색어를 2자 이상 입력해 주세요.").max(100, "검색어는 100자까지 입력할 수 있습니다."),
});
