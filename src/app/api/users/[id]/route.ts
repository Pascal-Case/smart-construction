import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { updateUserSchema } from "@/lib/auth/schemas";
import { requireUser } from "@/lib/auth/session";
import { updateManagedUser } from "@/lib/auth/user-service";

export async function PATCH(request: Request, context: RouteContext<"/api/users/[id]">) {
  try {
    const actor = await requireUser([UserRole.ADMIN]);
    const input = updateUserSchema.parse(await request.json());
    const { id } = await context.params;
    return Response.json({ user: await updateManagedUser(actor, id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
