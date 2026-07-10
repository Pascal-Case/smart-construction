import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { previewContractRevenues } from "@/lib/revenues/generator";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireUser([UserRole.ADMIN, UserRole.MANAGER]); return Response.json(await previewContractRevenues((await context.params).id)); }
  catch (error) { return errorResponse(error); }
}
