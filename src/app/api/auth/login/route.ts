import { errorResponse } from "@/lib/auth/errors";
import { loginSchema } from "@/lib/auth/schemas";
import { createSession } from "@/lib/auth/session";
import { authenticate } from "@/lib/auth/user-service";

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const user = await authenticate(input);
    await createSession(user.id);
    return Response.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
