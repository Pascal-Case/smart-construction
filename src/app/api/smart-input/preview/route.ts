import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { smartInputPreviewSchema } from "@/lib/smart-input/schemas";
import { previewSmartInput } from "@/lib/smart-input/service";

export async function POST(request: Request) {
  try {
    await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const input = smartInputPreviewSchema.parse(await request.json());
    return Response.json(await previewSmartInput(input.target, input.input, { selectedSiteId: input.selectedSiteId, selectedItemId: input.selectedItemId }));
  } catch (error) {
    return errorResponse(error);
  }
}
