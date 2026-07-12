import { InvoiceManager, type InvoiceList } from "@/components/invoices/invoice-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { getCompanySetting, isCompanySettingComplete } from "@/lib/company/service";
import { prisma } from "@/lib/db/prisma";
import { listInvoiceTemplates } from "@/lib/invoice-templates/service";
import { listInvoices } from "@/lib/invoices/service";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[]; siteId?: string | string[] }>;
}) {
  const query = await searchParams;
  const initialMonth = typeof query.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month)
    ? query.month
    : undefined;
  const initialSiteId = typeof query.siteId === "string" ? query.siteId : "";
  const user = await getCurrentUser();
  const [result, sites, company, templates] = await Promise.all([
    listInvoices({ q: "", siteId: "", startDate: "", endDate: "", page: 1, pageSize: 20 }),
    prisma.site.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getCompanySetting(),
    listInvoiceTemplates(),
  ]);
  const initialData: InvoiceList = { ...result, rows: result.rows.map((row) => ({ ...row, issueDate: row.issueDate.toISOString(), periodStart: row.periodStart.toISOString(), periodEnd: row.periodEnd.toISOString(), issuedAt: row.issuedAt.toISOString(), supersededAt: row.supersededAt?.toISOString() ?? null })) };
  return <div className="mx-auto max-w-[1500px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">청구·출력</p><h1 className="text-2xl font-semibold">거래명세표</h1><p className="mt-1 text-sm text-muted-foreground">마감한 현장·월 회차를 거래명세표로 발행하고 snapshot 발행본을 재출력합니다.</p></div><InvoiceManager initialData={initialData} sites={sites} templates={templates} canIssue={user?.role === "ADMIN" || user?.role === "MANAGER"} companyComplete={isCompanySettingComplete(company)} isAdmin={user?.role === "ADMIN"} initialMonth={initialMonth} initialSiteId={initialSiteId} /></div>;
}
