import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { contractRevenueBatchConfirmSchema } from "@/lib/revenues/schemas";
import { confirmContractRevenues } from "@/lib/revenues/service";

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const input = contractRevenueBatchConfirmSchema.parse(await request.json());
    return Response.json({ entries: await confirmContractRevenues(actor, input) });
  } catch (error) { return errorResponse(error); }
}
