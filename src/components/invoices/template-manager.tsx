"use client";

import { Copy, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { TemplateEditor } from "@/components/invoices/template-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { InvoiceTemplateConfig, InvoiceTemplateView } from "@/lib/invoice-templates/config";
import { invoiceTemplateConfigSchema } from "@/lib/invoice-templates/schemas";

export function TemplateManager({ initialTemplates, canEdit }: { initialTemplates: InvoiceTemplateView[]; canEdit: boolean }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState(initialTemplates[0]?.id ?? "");
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];
  const [name, setName] = useState(selected?.name ?? "");
  const [config, setConfig] = useState<InvoiceTemplateConfig>(selected?.config ?? initialTemplates[0].config);
  const [savedSignature, setSavedSignature] = useState(signature(selected?.name ?? "", selected?.config ?? initialTemplates[0].config));
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(() => signature(name, config) !== savedSignature, [name, config, savedSignature]);
  const valid = invoiceTemplateConfigSchema.safeParse(config).success;
  const editable = canEdit && !selected?.isSystem;

  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);

  function choose(template: InvoiceTemplateView) {
    if (template.id === selected?.id) return;
    if (dirty && !window.confirm("저장하지 않은 변경을 버리고 다른 템플릿으로 이동할까요?")) return;
    setSelectedId(template.id); setName(template.name); setConfig(structuredClone(template.config)); setSavedSignature(signature(template.name, template.config));
  }

  function openClone() { setCloneName(`${selected.name} 복사본`); setCloneOpen(true); }

  async function cloneTemplate() {
    if (!cloneName.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/invoice-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: cloneName, config }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "템플릿을 복제하지 못했습니다.");
      const created: InvoiceTemplateView = body.template;
      setTemplates((current) => [...current, created]); chooseFresh(created); setCloneOpen(false); toast.success("템플릿을 복제했습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "템플릿을 복제하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!editable || !valid || !name.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/invoice-templates/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, config, version: selected.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "템플릿을 저장하지 못했습니다.");
      const saved: InvoiceTemplateView = body.template;
      setTemplates((current) => current.map((template) => template.id === saved.id ? saved : template)); chooseFresh(saved); toast.success("템플릿을 저장했습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "템플릿을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!editable || !window.confirm(`'${selected.name}' 템플릿을 삭제할까요? 과거 발행본은 유지됩니다.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/invoice-templates/${selected.id}?version=${selected.version}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "템플릿을 삭제하지 못했습니다.");
      const remaining = templates.filter((template) => template.id !== selected.id); setTemplates(remaining); chooseFresh(remaining[0]); toast.success("템플릿을 삭제했습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "템플릿을 삭제하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function chooseFresh(template: InvoiceTemplateView) { setSelectedId(template.id); setName(template.name); setConfig(structuredClone(template.config)); setSavedSignature(signature(template.name, template.config)); }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="outline" render={<Link href="/invoices" />}>거래명세표로</Button><div className="flex gap-2">{canEdit && <Button variant="outline" onClick={openClone}><Copy data-icon="inline-start" />복제</Button>}{editable && <><Button variant="outline" disabled={busy} onClick={() => void remove()}><Trash2 data-icon="inline-start" />삭제</Button><Button disabled={busy || !dirty || !valid || !name.trim()} onClick={() => void save()}><Save data-icon="inline-start" />{busy ? "저장 중..." : "저장"}</Button></>}</div></div>
    <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="space-y-2 rounded-xl border bg-card p-3"><p className="px-2 py-1 font-semibold">공용 템플릿</p>{templates.map((template) => <button key={template.id} type="button" onClick={() => choose(template)} className={`w-full rounded-lg border p-3 text-left ${template.id === selected.id ? "border-teal-500 bg-teal-50 dark:bg-teal-950/30" : "hover:bg-muted"}`}><span className="flex items-center justify-between gap-2"><strong className="truncate">{template.name}</strong>{template.isSystem && <Badge variant="outline">기본</Badge>}</span><span className="mt-1 block text-xs text-muted-foreground">{template.updatedAt ? `수정 ${new Date(template.updatedAt).toLocaleString("ko-KR")}` : "복제해서 편집"}</span></button>)}</aside>
      <section className="space-y-4"><div className="rounded-xl border bg-card p-4"><Label htmlFor="template-name">템플릿 이름</Label><Input id="template-name" className="mt-1.5" disabled={!editable} value={name} onChange={(event) => setName(event.target.value)} /><p className="mt-2 text-xs text-muted-foreground">{selected.isSystem ? "시스템 기본은 수정할 수 없습니다. 복제해서 새 템플릿을 만드세요." : "관리자와 매니저가 함께 사용하는 공용 템플릿입니다."}</p></div><TemplateEditor config={config} onChange={setConfig} readOnly={!editable} /></section>
    </div>
    {cloneOpen && <Dialog open onOpenChange={setCloneOpen}><DialogContent><DialogHeader><DialogTitle>템플릿 복제</DialogTitle><DialogDescription>현재 배치와 스타일을 복사해 새 공용 템플릿을 만듭니다.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="clone-name">새 이름</Label><Input id="clone-name" value={cloneName} onChange={(event) => setCloneName(event.target.value)} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCloneOpen(false)}>취소</Button><Button disabled={busy || !cloneName.trim()} onClick={() => void cloneTemplate()}>복제</Button></div></DialogContent></Dialog>}
  </div>;
}

function signature(name: string, config: InvoiceTemplateConfig) { return JSON.stringify({ name, config }); }
