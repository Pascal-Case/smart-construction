import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { legacyPreviewRequestSchema, migrationHistoryQuerySchema } from "@/lib/migration/schemas";
import { listLegacyMigrationHistory, previewLegacyMigration } from "@/lib/migration/service";

export async function GET(request: Request) {
  try {
    await requireUser([UserRole.ADMIN]);
    const query = migrationHistoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json({ rows: await listLegacyMigrationHistory(query.take) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser([UserRole.ADMIN]);
    const input = legacyPreviewRequestSchema.parse(await request.json());
    return Response.json(await previewLegacyMigration(input.bundle, input.sourceName));
  } catch (error) {
    return errorResponse(error);
  }
}
