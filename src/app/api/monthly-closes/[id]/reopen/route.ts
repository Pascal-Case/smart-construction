import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { reopenMonthlyCloseSchema } from "@/lib/monthly-close/schemas";
import { reopenMonthlyClose } from "@/lib/monthly-close/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser([UserRole.ADMIN]);
    const input = reopenMonthlyCloseSchema.parse(await request.json());
    return Response.json({ close: await reopenMonthlyClose(actor, (await context.params).id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
