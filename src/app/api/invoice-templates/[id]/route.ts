import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceTemplateDeleteSchema, invoiceTemplateUpdateSchema } from "@/lib/invoice-templates/schemas";
import { deleteInvoiceTemplate, updateInvoiceTemplate } from "@/lib/invoice-templates/service";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteParams) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const { id } = await context.params;
    const template = await updateInvoiceTemplate(actor, id, invoiceTemplateUpdateSchema.parse(await request.json()));
    return Response.json({ template });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteParams) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const { id } = await context.params;
    const { version } = invoiceTemplateDeleteSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await deleteInvoiceTemplate(actor, id, version));
  } catch (error) {
    return errorResponse(error);
  }
}
