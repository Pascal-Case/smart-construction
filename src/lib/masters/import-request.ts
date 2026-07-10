import { readMasterPaste, readMasterWorkbook } from "@/lib/excel/master-workbook";
import { AuthError } from "@/lib/auth/errors";

export async function parseImportRequest(request: Request, type: "site" | "item") {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new AuthError("Excel 파일을 선택해 주세요.", 400, "IMPORT_FILE_REQUIRED");
      return {
        rows: await readMasterWorkbook(await file.arrayBuffer(), type),
        source: "file" as const,
        sourceName: file.name,
        mode: form.get("mode") === "allOrNothing" ? "allOrNothing" as const : "validOnly" as const,
      };
    }
    const body = await request.json();
    if (typeof body.content !== "string") throw new AuthError("붙여넣을 Excel 데이터를 입력해 주세요.", 400, "IMPORT_CONTENT_REQUIRED");
    return {
      rows: readMasterPaste(body.content, type), source: "paste" as const, sourceName: null,
      mode: body.mode === "allOrNothing" ? "allOrNothing" as const : "validOnly" as const,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(error instanceof Error ? error.message : "가져오기 데이터를 읽지 못했습니다.", 400, "IMPORT_PARSE_ERROR");
  }
}
