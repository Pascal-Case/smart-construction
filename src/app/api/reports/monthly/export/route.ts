import { z } from "zod";

import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { exportMonthlyReportWorkbook } from "@/lib/excel/monthly-report-export";
import { MONTHLY_REPORT_METRICS } from "@/lib/excel/monthly-report-workbook";
import { monthlyReportQuerySchema } from "@/lib/reports/monthly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();
    const values = Object.fromEntries(new URL(request.url).searchParams);
    const query = monthlyReportQuerySchema.parse(values);
    const metric = z.enum(MONTHLY_REPORT_METRICS).default("salesAmount").parse(values.metric);
    return await exportMonthlyReportWorkbook(query, metric);
  } catch (error) {
    return errorResponse(error);
  }
}
