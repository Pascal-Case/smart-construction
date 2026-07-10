import { redirect } from "next/navigation";

import { CompanySettingsForm, type CompanySettingView } from "@/components/company/company-settings-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getCompanySetting } from "@/lib/company/service";

export default async function CompanySettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/");
  const setting = await getCompanySetting();
  const initialSetting: CompanySettingView = { ...setting, updatedAt: setting.updatedAt?.toISOString() ?? null };
  return <div className="mx-auto max-w-4xl space-y-6"><div><p className="text-sm font-semibold text-teal-700">출력 설정</p><h1 className="text-2xl font-semibold">공급자 정보</h1><p className="mt-1 text-sm text-muted-foreground">거래명세표 발행 시 이 정보를 snapshot으로 보존합니다.</p></div><CompanySettingsForm initialSetting={initialSetting} /></div>;
}
