import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { companySettingInputSchema } from "@/lib/company/schemas";
import { getCompanySetting, saveCompanySetting } from "@/lib/company/service";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ setting: await getCompanySetting() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN]);
    const setting = await saveCompanySetting(actor, companySettingInputSchema.parse(await request.json()));
    return Response.json({ setting });
  } catch (error) {
    return errorResponse(error);
  }
}
