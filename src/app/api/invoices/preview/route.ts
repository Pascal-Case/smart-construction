import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { invoicePreviewInputSchema } from "@/lib/invoices/schemas";
import { previewInvoices } from "@/lib/invoices/service";

export async function POST(request: Request) {
  try {
    await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    return Response.json(await previewInvoices(invoicePreviewInputSchema.parse(await request.json())));
  } catch (error) {
    return errorResponse(error);
  }
}
