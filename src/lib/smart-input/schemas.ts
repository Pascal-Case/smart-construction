import { z } from "zod";

export const smartInputPreviewSchema = z.object({
  target: z.enum(["CONTRACT", "REVENUE"]),
  input: z.string().trim().min(3, "분석할 문장을 3자 이상 입력해 주세요.").max(1_000, "문장은 1,000자까지 입력할 수 있습니다."),
});
