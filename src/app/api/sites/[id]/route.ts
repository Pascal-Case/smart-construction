import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { siteUpdateSchema } from "@/lib/masters/schemas";
import { updateSite } from "@/lib/masters/site-service";

export async function PATCH(request: Request, context: RouteContext<"/api/sites/[id]">) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); const { id } = await context.params; return Response.json({ row: await updateSite(actor, id, siteUpdateSchema.parse(await request.json())) }); }
  catch (error) { return errorResponse(error); }
}
