import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { revenueUpdateSchema } from "@/lib/revenues/schemas";
import { updateRevenue } from "@/lib/revenues/service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); return Response.json({ entry: await updateRevenue(actor, (await context.params).id, revenueUpdateSchema.parse(await request.json())) }); }
  catch (error) { return errorResponse(error); }
}
