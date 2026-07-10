import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceCandidateQuerySchema } from "@/lib/invoices/schemas";
import { getInvoiceCandidates } from "@/lib/invoices/service";

export async function GET(request: Request) {
  try {
    await requireUser();
    const query = invoiceCandidateQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await getInvoiceCandidates(query));
  } catch (error) {
    return errorResponse(error);
  }
}
