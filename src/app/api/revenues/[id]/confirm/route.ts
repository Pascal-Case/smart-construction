import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { revenueConfirmSchema } from "@/lib/revenues/schemas";
import { confirmRevenue } from "@/lib/revenues/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); const input = revenueConfirmSchema.parse(await request.json()); return Response.json({ entry: await confirmRevenue(actor, (await context.params).id, input.version) }); }
  catch (error) { return errorResponse(error); }
}
