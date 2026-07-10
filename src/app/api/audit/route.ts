import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await requireUser([UserRole.ADMIN]);
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return Response.json({ logs });
  } catch (error) {
    return errorResponse(error);
  }
}
