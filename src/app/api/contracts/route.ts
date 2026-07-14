import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { contractCreateInputSchema, contractListQuerySchema } from "@/lib/contracts/schemas";
import { createContract, listContracts } from "@/lib/contracts/service";

export async function GET(request: Request) {
  try {
    await requireUser();
    return Response.json(await listContracts(contractListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    return Response.json({ contract: await createContract(actor, contractCreateInputSchema.parse(await request.json())) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
