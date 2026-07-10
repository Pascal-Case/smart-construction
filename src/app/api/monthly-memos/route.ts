import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { memoKeySchema, saveMemoSchema } from "@/lib/monthly-memos/schemas";
import { getMonthlyMemo, saveMonthlyMemo } from "@/lib/monthly-memos/service";

export async function GET(request: Request) {
  try { await requireUser(); const key = memoKeySchema.parse(Object.fromEntries(new URL(request.url).searchParams)); return Response.json({ memo: await getMonthlyMemo(key.siteId, key.month) }); }
  catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try { const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]); return Response.json({ memo: await saveMonthlyMemo(actor, saveMemoSchema.parse(await request.json())) }); }
  catch (error) { return errorResponse(error); }
}
