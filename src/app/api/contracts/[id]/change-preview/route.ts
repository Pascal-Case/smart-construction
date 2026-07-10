import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { contractInputSchema } from "@/lib/contracts/schemas";
import { previewContractChange } from "@/lib/contracts/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    return Response.json({ impact: await previewContractChange(actor, (await context.params).id, contractInputSchema.parse(await request.json())) });
  } catch (error) { return errorResponse(error); }
}
