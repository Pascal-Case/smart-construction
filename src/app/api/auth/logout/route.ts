import { recordAudit } from "@/lib/audit/record";
import { deleteCurrentSession, getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function POST() {
  const user = await getCurrentUser();
  await deleteCurrentSession();
  if (user) {
    await prisma.$transaction((tx) =>
      recordAudit(tx, { actorId: user.id, actorName: user.name, action: "LOGOUT", entityType: "SESSION", entityId: user.id }),
    );
  }
  return Response.json({ success: true });
}
