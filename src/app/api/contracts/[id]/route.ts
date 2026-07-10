import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { contractUpdateSchema } from "@/lib/contracts/schemas";
import { getContract, updateContract } from "@/lib/contracts/service";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireUser(); return Response.json({ contract: await getContract((await context.params).id) }); }
  catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    return Response.json({ contract: await updateContract(actor, (await context.params).id, contractUpdateSchema.parse(await request.json())) });
  } catch (error) { return errorResponse(error); }
}
