import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { exportRevenueWorkbook } from "@/lib/excel/revenue-export";
import { revenueListQuerySchema } from "@/lib/revenues/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();
    const query = revenueListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return await exportRevenueWorkbook(query);
  } catch (error) {
    return errorResponse(error);
  }
}
