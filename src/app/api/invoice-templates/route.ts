import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceTemplateCreateSchema } from "@/lib/invoice-templates/schemas";
import { createInvoiceTemplate, listInvoiceTemplates } from "@/lib/invoice-templates/service";

export async function GET() {
  try {
    await requireUser();
    return Response.json({ templates: await listInvoiceTemplates() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const template = await createInvoiceTemplate(actor, invoiceTemplateCreateSchema.parse(await request.json()));
    return Response.json({ template }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
