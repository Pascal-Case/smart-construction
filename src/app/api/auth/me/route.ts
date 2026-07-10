import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";

export async function GET() {
  try {
    return Response.json({ user: await requireUser() });
  } catch (error) {
    return errorResponse(error);
  }
}
