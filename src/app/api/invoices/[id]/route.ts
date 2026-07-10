import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { getInvoiceDocument } from "@/lib/invoices/service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await context.params;
    return Response.json({ document: await getInvoiceDocument(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
