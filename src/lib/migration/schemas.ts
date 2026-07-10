import { z } from "zod";

export const legacyPreviewRequestSchema = z.object({
  bundle: z.unknown(),
  sourceName: z.string().trim().max(255).optional().nullable(),
});

export const legacyCommitRequestSchema = z.object({
  bundle: z.unknown(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/, "이관 fingerprint가 올바르지 않습니다."),
  sourceName: z.string().trim().max(255).optional().nullable(),
});

export const migrationHistoryQuerySchema = z.object({ take: z.coerce.number().int().min(1).max(50).default(10) });
