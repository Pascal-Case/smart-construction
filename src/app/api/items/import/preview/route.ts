import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { parseImportRequest } from "@/lib/masters/import-request";
import { previewItemImport } from "@/lib/masters/import-service";

export async function POST(request: Request) {
  try {
    await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const parsed = await parseImportRequest(request, "item");
    return Response.json(await previewItemImport(parsed.rows));
  } catch (error) {
    return errorResponse(error);
  }
}
