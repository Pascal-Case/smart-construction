import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { contractCategoryCreateSchema } from "@/lib/contract-categories/schemas";
import { createContractCategory, listContractCategories } from "@/lib/contract-categories/service";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ categories: await listContractCategories() });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN]);
    const category = await createContractCategory(actor, contractCategoryCreateSchema.parse(await request.json()));
    return Response.json({ category }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
