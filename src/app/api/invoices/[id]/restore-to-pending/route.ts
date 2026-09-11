import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceRestoreToPendingInputSchema } from "@/lib/invoices/schemas";
import { restoreInvoiceToPending } from "@/lib/invoices/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const { id } = await context.params;
    const result = await restoreInvoiceToPending(actor, id, invoiceRestoreToPendingInputSchema.parse(await request.json()));
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
