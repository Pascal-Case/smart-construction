import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { generateContractRevenues } from "@/lib/revenues/generator";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); return Response.json({ counts: await generateContractRevenues(actor, (await context.params).id) }); }
  catch (error) { return errorResponse(error); }
}
