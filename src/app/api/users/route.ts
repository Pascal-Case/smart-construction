import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { createUserSchema } from "@/lib/auth/schemas";
import { requireUser } from "@/lib/auth/session";
import { createManagedUser, listUsers } from "@/lib/auth/user-service";

export async function GET() {
  try {
    await requireUser([UserRole.ADMIN]);
    return Response.json({ users: await listUsers() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN]);
    const input = createUserSchema.parse(await request.json());
    return Response.json({ user: await createManagedUser(actor, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
