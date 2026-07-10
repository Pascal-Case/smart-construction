import { UserRole } from "@/generated/prisma/client";
import { AuthError, errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { previewNormalizedLegacyMigration } from "@/lib/migration/service";
import { parseLegacyWorkbook } from "@/lib/migration/workbook";

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireUser([UserRole.ADMIN]);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new AuthError("Excel 파일을 선택해 주세요.", 400, "MIGRATION_FILE_REQUIRED");
    if (file.size > MAX_EXCEL_BYTES) throw new AuthError("Excel 파일은 5MB 이하만 이관할 수 있습니다.", 413, "MIGRATION_FILE_TOO_LARGE");
    if (!/.(xlsx|xlsm)$/i.test(file.name)) throw new AuthError("xlsx 또는 xlsm 파일만 사용할 수 있습니다.", 400, "MIGRATION_FILE_TYPE");
    let parsed;
    try {
      parsed = await parseLegacyWorkbook(Buffer.from(await file.arrayBuffer()), file.name);
    } catch (error) {
      throw new AuthError(error instanceof Error ? error.message : "Excel 파일을 해석하지 못했습니다.", 400, "MIGRATION_EXCEL_INVALID");
    }
    return Response.json(await previewNormalizedLegacyMigration(parsed.bundle, parsed.issues));
  } catch (error) {
    return errorResponse(error);
  }
}
