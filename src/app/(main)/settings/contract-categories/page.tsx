import { redirect } from "next/navigation";

import { ContractCategoryManager } from "@/components/contract-categories/contract-category-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { listContractCategories } from "@/lib/contract-categories/service";

export default async function ContractCategoriesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");
  return <div className="mx-auto max-w-5xl space-y-6"><div><p className="text-sm font-semibold text-teal-700">설정</p><h1 className="text-2xl font-semibold">계약 구분 관리</h1><p className="mt-1 text-sm text-muted-foreground">거래명세표를 분리하는 계약 구분을 관리합니다. 코드는 생성 후 유지됩니다.</p></div><ContractCategoryManager initialCategories={await listContractCategories()} /></div>;
}
