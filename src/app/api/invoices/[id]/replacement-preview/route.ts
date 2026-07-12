import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceReplacementPreviewInputSchema } from "@/lib/invoices/schemas";
import { previewReplacementInvoice } from "@/lib/invoices/service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const { id } = await context.params;
    return Response.json(await previewReplacementInvoice(id, invoiceReplacementPreviewInputSchema.parse(await request.json())));
  } catch (error) {
    return errorResponse(error);
  }
}
