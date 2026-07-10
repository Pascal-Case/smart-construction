import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { masterListQuerySchema, siteInputSchema } from "@/lib/masters/schemas";
import { createSite, listSites } from "@/lib/masters/site-service";

export async function GET(request: Request) {
  try { await requireUser(); const url = new URL(request.url); return Response.json(await listSites(masterListQuerySchema.parse(Object.fromEntries(url.searchParams)))); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); return Response.json({ row: await createSite(actor, siteInputSchema.parse(await request.json())) }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
