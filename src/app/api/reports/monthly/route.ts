import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { getMonthlyReport, monthlyReportQuerySchema } from "@/lib/reports/monthly";

export async function GET(request: Request) {
  try { await requireUser(); return Response.json(await getMonthlyReport(monthlyReportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)))); }
  catch (error) { return errorResponse(error); }
}
