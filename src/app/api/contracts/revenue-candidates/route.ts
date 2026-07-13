import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { contractRevenueCandidateQuerySchema } from "@/lib/contracts/schemas";
import { listContractRevenueCandidates } from "@/lib/revenues/generator";

export async function GET(request: Request) {
  try {
    await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const query = contractRevenueCandidateQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await listContractRevenueCandidates(query));
  } catch (error) {
    return errorResponse(error);
  }
}
