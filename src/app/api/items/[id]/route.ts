import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { updateItem } from "@/lib/masters/item-service";
import { itemUpdateSchema } from "@/lib/masters/schemas";

export async function PATCH(request: Request, context: RouteContext<"/api/items/[id]">) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); const { id } = await context.params; return Response.json({ row: await updateItem(actor, id, itemUpdateSchema.parse(await request.json())) }); }
  catch (error) { return errorResponse(error); }
}
