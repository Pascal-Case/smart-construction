import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { exportSiteWorkbook } from "@/lib/excel/master-export";

export async function GET(request: Request) {
  try {
    await requireUser();
    return await exportSiteWorkbook(new URL(request.url).searchParams.get("template") === "1");
  } catch (error) {
    return errorResponse(error);
  }
}
