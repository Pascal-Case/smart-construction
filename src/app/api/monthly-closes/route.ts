import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { monthlyCloseQuerySchema } from "@/lib/monthly-close/schemas";
import { getMonthCloseControlRoom } from "@/lib/monthly-close/service";

export async function GET(request: Request) {
  try {
    await requireUser();
    const query = monthlyCloseQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await getMonthCloseControlRoom(query));
  } catch (error) {
    return errorResponse(error);
  }
}
