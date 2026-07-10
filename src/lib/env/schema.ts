import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string({ error: "DATABASE_URL이 설정되지 않았습니다." })
    .trim()
    .min(1, "DATABASE_URL이 비어 있습니다.")
    .refine(
      (value) => value.startsWith("file:"),
      "DATABASE_URL은 SQLite file: URL이어야 합니다.",
    ),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  SESSION_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  input: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(input);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "환경변수"}: ${issue.message}`)
      .join("; ");

    throw new Error(`서버 환경설정이 올바르지 않습니다. ${details}`);
  }

  return result.data;
}
