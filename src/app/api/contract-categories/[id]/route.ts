import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { contractCategoryUpdateSchema } from "@/lib/contract-categories/schemas";
import { updateContractCategory } from "@/lib/contract-categories/service";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser([UserRole.ADMIN]);
    const { id } = await context.params;
    const category = await updateContractCategory(actor, id, contractCategoryUpdateSchema.parse(await request.json()));
    return Response.json({ category });
  } catch (error) { return errorResponse(error); }
}
