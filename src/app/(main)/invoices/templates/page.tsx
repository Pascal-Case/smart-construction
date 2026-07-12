import { TemplateManager } from "@/components/invoices/template-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { listInvoiceTemplates } from "@/lib/invoice-templates/service";

export default async function InvoiceTemplatesPage() {
  const [user, templates] = await Promise.all([getCurrentUser(), listInvoiceTemplates()]);
  const canEdit = user?.role === "ADMIN" || user?.role === "MANAGER";
  return <div className="mx-auto max-w-[1700px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">청구·출력</p><h1 className="text-2xl font-semibold">거래명세표 템플릿</h1><p className="mt-1 text-sm text-muted-foreground">공용 양식의 블록 배치, 폰트, 색상과 표 열을 조정합니다.</p></div><TemplateManager initialTemplates={templates} canEdit={canEdit} /></div>;
}
