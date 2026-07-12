import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { reviewMonthlyCloseExceptionSchema } from "@/lib/monthly-close/schemas";
import { reviewMonthlyCloseException } from "@/lib/monthly-close/service";

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const input = reviewMonthlyCloseExceptionSchema.parse(await request.json());
    return Response.json({ review: await reviewMonthlyCloseException(actor, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
