import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { contractRevenueGenerationBatchPreviewSchema } from "@/lib/revenues/schemas";
import { previewContractRevenuesBatch } from "@/lib/revenues/generator";

export async function POST(request: Request) {
  try {
    await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const input = contractRevenueGenerationBatchPreviewSchema.parse(await request.json());
    return Response.json(await previewContractRevenuesBatch(input.contractIds));
  } catch (error) {
    return errorResponse(error);
  }
}
