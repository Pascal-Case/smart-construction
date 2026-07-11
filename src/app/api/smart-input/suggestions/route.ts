import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { smartInputSuggestionsQuerySchema } from "@/lib/smart-input/schemas";
import { suggestSmartInput } from "@/lib/smart-input/service";

export async function GET(request: Request) {
  try {
    await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const query = smartInputSuggestionsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json({ suggestions: await suggestSmartInput(query.q) });
  } catch (error) {
    return errorResponse(error);
  }
}
