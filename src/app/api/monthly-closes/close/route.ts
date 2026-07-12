import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { closeMonthlySitesSchema } from "@/lib/monthly-close/schemas";
import { closeMonthlySites } from "@/lib/monthly-close/service";

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const input = closeMonthlySitesSchema.parse(await request.json());
    return Response.json({ results: await closeMonthlySites(actor, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
