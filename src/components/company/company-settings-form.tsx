"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CompanySettingView = {
  id: string;
  businessRegistrationNo: string;
  companyName: string;
  representativeName: string;
  address: string;
  businessType: string;
  businessItem: string;
  phone: string;
  defaultMessage: string;
  version: number | null;
  updatedAt: string | null;
};

export function CompanySettingsForm({ initialSetting }: { initialSetting: CompanySettingView }) {
  const [setting, setSetting] = useState(initialSetting);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const body = { businessRegistrationNo: data.get("businessRegistrationNo"), companyName: data.get("companyName"), representativeName: data.get("representativeName"), address: data.get("address"), businessType: data.get("businessType"), businessItem: data.get("businessItem"), phone: data.get("phone"), defaultMessage: data.get("defaultMessage"), version: setting.version };
    try {
      const response = await fetch("/api/company-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "공급자 정보를 저장하지 못했습니다.");
      setSetting({ ...result.setting, updatedAt: result.setting.updatedAt });
      toast.success("공급자 정보를 저장했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공급자 정보를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return <form key={setting.version ?? "new"} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2" onSubmit={save}>
    <Field label="등록번호" name="businessRegistrationNo" defaultValue={setting.businessRegistrationNo} placeholder="101-81-30747" />
    <Field label="상호(법인명)" name="companyName" defaultValue={setting.companyName} />
    <Field label="대표자 성명" name="representativeName" defaultValue={setting.representativeName} />
    <Field label="전화번호" name="phone" defaultValue={setting.phone} />
    <Field label="사업장 주소" name="address" defaultValue={setting.address} className="sm:col-span-2" />
    <Field label="업태" name="businessType" defaultValue={setting.businessType} />
    <Field label="종목" name="businessItem" defaultValue={setting.businessItem} />
    <Field label="공급 안내 문구" name="defaultMessage" defaultValue={setting.defaultMessage} className="sm:col-span-2" />
    <div className="flex items-center justify-between sm:col-span-2"><p className="text-xs text-muted-foreground">{setting.updatedAt ? `마지막 수정: ${new Date(setting.updatedAt).toLocaleString("ko-KR")}` : "아직 저장되지 않았습니다."}</p><Button type="submit" disabled={busy}><Save data-icon="inline-start" />{busy ? "저장 중..." : "저장"}</Button></div>
  </form>;
}

function Field({ label, className = "", ...props }: React.ComponentProps<typeof Input> & { label: string; className?: string }) {
  const id = String(props.name);
  return <div className={`space-y-1.5 ${className}`}><Label htmlFor={id}>{label}</Label><Input id={id} required {...props} /></div>;
}
