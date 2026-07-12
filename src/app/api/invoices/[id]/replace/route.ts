import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceReplacementIssueInputSchema } from "@/lib/invoices/schemas";
import { replaceInvoice } from "@/lib/invoices/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const { id } = await context.params;
    const document = await replaceInvoice(actor, id, invoiceReplacementIssueInputSchema.parse(await request.json()));
    return Response.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
