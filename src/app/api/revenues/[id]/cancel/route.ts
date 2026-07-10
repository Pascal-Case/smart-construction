import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { revenueCancelSchema } from "@/lib/revenues/schemas";
import { cancelRevenue } from "@/lib/revenues/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); const input = revenueCancelSchema.parse(await request.json()); return Response.json({ entry: await cancelRevenue(actor, (await context.params).id, input.version, input.reason) }); }
  catch (error) { return errorResponse(error); }
}
