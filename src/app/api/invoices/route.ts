import { UserRole } from "@/generated/prisma/client";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/session";
import { invoiceIssueInputSchema, invoiceListQuerySchema } from "@/lib/invoices/schemas";
import { issueInvoices, listInvoices } from "@/lib/invoices/service";

export async function GET(request: Request) {
  try {
    await requireUser();
    const query = invoiceListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await listInvoices(query));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser([UserRole.ADMIN, UserRole.MANAGER]);
    const documents = await issueInvoices(actor, invoiceIssueInputSchema.parse(await request.json()));
    return Response.json({ documents }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
