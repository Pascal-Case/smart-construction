import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { legacyCommitRequestSchema } from "@/lib/migration/schemas";
import { commitLegacyMigration } from "@/lib/migration/service";

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN]);
    const input = legacyCommitRequestSchema.parse(await request.json());
    return Response.json(await commitLegacyMigration(actor, input.bundle, input.fingerprint, input.sourceName), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
