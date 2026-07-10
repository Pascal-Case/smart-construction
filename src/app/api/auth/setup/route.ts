import { createSession } from "@/lib/auth/session";
import { errorResponse } from "@/lib/auth/errors";
import { setupSchema } from "@/lib/auth/schemas";
import { hasAnyUser, setupInitialAdmin } from "@/lib/auth/user-service";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ setupRequired: !(await hasAnyUser()) });
}

export async function POST(request: Request) {
  try {
    const input = setupSchema.parse(await request.json());
    const user = await setupInitialAdmin(input);
    await createSession(user.id);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
