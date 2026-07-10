import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { parseImportRequest } from "@/lib/masters/import-request";
import { previewSiteImport } from "@/lib/masters/import-service";

export async function POST(request: Request) {
  try {
    await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const parsed = await parseImportRequest(request, "site");
    return Response.json(await previewSiteImport(parsed.rows));
  } catch (error) {
    return errorResponse(error);
  }
}
