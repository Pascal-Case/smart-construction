import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { parseImportRequest } from "@/lib/masters/import-request";
import { commitMasterImport } from "@/lib/masters/import-service";

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const parsed = await parseImportRequest(request, "item");
    return Response.json({ counts: await commitMasterImport(actor, "item", parsed.source, parsed.sourceName, parsed.rows, parsed.mode) });
  } catch (error) {
    return errorResponse(error);
  }
}
