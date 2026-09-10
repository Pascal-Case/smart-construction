import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { generateContractRevenuesBatch } from "@/lib/revenues/generator";
import { contractRevenueGenerationBatchSchema } from "@/lib/revenues/schemas";

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const input = contractRevenueGenerationBatchSchema.parse(await request.json());
    return Response.json(await generateContractRevenuesBatch(actor, input.targets));
  } catch (error) {
    return errorResponse(error);
  }
}
