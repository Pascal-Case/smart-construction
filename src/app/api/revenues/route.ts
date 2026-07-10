import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { revenueInputSchema, revenueListQuerySchema } from "@/lib/revenues/schemas";
import { createRevenue, listRevenues } from "@/lib/revenues/service";

export async function GET(request: Request) {
  try { await requireUser(); return Response.json(await listRevenues(revenueListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)))); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); return Response.json({ entry: await createRevenue(actor, revenueInputSchema.parse(await request.json())) }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
