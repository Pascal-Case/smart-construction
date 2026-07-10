"use client";

import { Download, FileDown, Pencil, Plus, Search, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MasterType = "site" | "item";
type BaseRow = { id: string; code: string; name: string; aliases: string[]; isActive: boolean; version: number; updatedAt: string };
export type SiteView = BaseRow & { customerName: string | null; address: string | null; managerName: string | null; managerContact: string | null; startDate: string | null; endDate: string | null; memo: string | null };
export type ItemView = BaseRow & { unit: string; standardSalesPrice: number; standardCostPrice: number; memo: string | null };
type MasterRow = SiteView | ItemView;
export type MasterList<T extends MasterRow> = { rows: T[]; total: number; page: number; pageSize: number; totalPages: number };
type Preview = { rows: Array<{ rowNumber: number; status: "CREATE" | "UPDATE" | "UNCHANGED" | "ERROR"; code: string; name: string; errors: string[] }>; counts: { total: number; create: number; update: number; unchanged: number; error: number } };

export function MasterManager({ type, initialData, canEdit }: { type: MasterType; initialData: MasterList<MasterRow>; canEdit: boolean }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState("name");
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MasterRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const endpoint = type === "site" ? "sites" : "items";
  const title = type === "site" ? "현장" : "품목";

  async function load(page = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query, status, sort, page: String(page), pageSize: "20" });
      const response = await fetch(`/api/${endpoint}?${params}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? `${title} 목록을 불러오지 못했습니다.`);
      setData(body);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() { setEditing(null); setEditorOpen(true); }
  function openEdit(row: MasterRow) { setEditing(row); setEditorOpen(true); }

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 xl:flex-row xl:items-end">
      <form className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { event.preventDefault(); void load(1); }}>
        <div className="min-w-60 flex-1 space-y-1.5"><Label htmlFor={`${type}-search`}>검색</Label><Input id={`${type}-search`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={type === "site" ? "코드, 현장명, 거래처, 별칭" : "코드, 품목명, 별칭"} /></div>
        <SelectField label="상태" value={status} onChange={setStatus} options={[{ value: "active", label: "사용 중" }, { value: "inactive", label: "사용 중지" }, { value: "all", label: "전체" }]} />
        <SelectField label="정렬" value={sort} onChange={setSort} options={[{ value: "name", label: "이름" }, { value: "code", label: "코드" }, { value: "updatedAt", label: "최근 수정" }]} />
        <Button type="submit" variant="outline" disabled={loading}><Search data-icon="inline-start" />조회</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" render={<a href={`/api/${endpoint}/export?template=1`} />}><FileDown data-icon="inline-start" />양식</Button>
        <Button variant="outline" render={<a href={`/api/${endpoint}/export`} />}><Download data-icon="inline-start" />Excel</Button>
        {canEdit && <><Button variant="outline" onClick={() => setImportOpen(true)}><Upload data-icon="inline-start" />가져오기</Button><Button onClick={openCreate}><Plus data-icon="inline-start" />{title} 추가</Button></>}
      </div>
    </div>

    <div className="overflow-x-auto rounded-xl border bg-white">
      <Table><TableHeader><TableRow><TableHead>코드</TableHead><TableHead>{title}명</TableHead>{type === "site" ? <><TableHead>거래처</TableHead><TableHead>담당자</TableHead><TableHead>운영 기간</TableHead></> : <><TableHead>단위</TableHead><TableHead className="text-right">표준 매출단가</TableHead><TableHead className="text-right">표준 매입단가</TableHead></>}<TableHead>별칭</TableHead><TableHead>상태</TableHead>{canEdit && <TableHead className="text-right">관리</TableHead>}</TableRow></TableHeader>
        <TableBody>{data.rows.length === 0 ? <TableRow><TableCell colSpan={canEdit ? 8 : 7} className="h-28 text-center text-muted-foreground">조건에 맞는 {title}이 없습니다.</TableCell></TableRow> : data.rows.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.code}</TableCell><TableCell className="font-medium">{row.name}</TableCell>{type === "site" ? <SiteCells row={row as SiteView} /> : <ItemCells row={row as ItemView} />}<TableCell className="max-w-52 truncate text-xs text-muted-foreground" title={row.aliases.join(", ")}>{row.aliases.join(", ") || "-"}</TableCell><TableCell><Badge variant={row.isActive ? "secondary" : "outline"}>{row.isActive ? "사용" : "중지"}</Badge></TableCell>{canEdit && <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => openEdit(row)}><Pencil data-icon="inline-start" />수정</Button></TableCell>}</TableRow>)}</TableBody>
      </Table>
    </div>
    <div className="flex items-center justify-between text-sm text-muted-foreground"><span>총 {data.total.toLocaleString()}건 · {data.page}/{data.totalPages} 페이지</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={loading || data.page <= 1} onClick={() => void load(data.page - 1)}>이전</Button><Button size="sm" variant="outline" disabled={loading || data.page >= data.totalPages} onClick={() => void load(data.page + 1)}>다음</Button></div></div>

    <MasterEditor type={type} open={editorOpen} row={editing} onOpenChange={setEditorOpen} onSaved={() => void load(data.page)} />
    <ImportDialog type={type} open={importOpen} onOpenChange={setImportOpen} onCommitted={() => void load(1)} />
  </div>;
}

function SiteCells({ row }: { row: SiteView }) {
  const period = [row.startDate?.slice(0, 10), row.endDate?.slice(0, 10)].filter(Boolean).join(" ~ ");
  return <><TableCell>{row.customerName || "-"}</TableCell><TableCell>{row.managerName || "-"}<span className="block text-xs text-muted-foreground">{row.managerContact}</span></TableCell><TableCell className="whitespace-nowrap text-xs">{period || "-"}</TableCell></>;
}
function ItemCells({ row }: { row: ItemView }) {
  return <><TableCell>{row.unit}</TableCell><TableCell className="text-right tabular-nums">{row.standardSalesPrice.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums">{row.standardCostPrice.toLocaleString()}</TableCell></>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 min-w-28 rounded-lg border bg-background px-3 text-sm">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

function MasterEditor({ type, open, row, onOpenChange, onSaved }: { type: MasterType; open: boolean; row: MasterRow | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const title = type === "site" ? "현장" : "품목";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = { code: form.get("code"), name: form.get("name"), isActive: form.get("isActive") === "on", memo: form.get("memo"), aliases: String(form.get("aliases") ?? "").split(/[|,;]/).map((value) => value.trim()).filter(Boolean) };
    if (type === "site") Object.assign(payload, { customerName: form.get("customerName"), address: form.get("address"), managerName: form.get("managerName"), managerContact: form.get("managerContact"), startDate: form.get("startDate"), endDate: form.get("endDate") });
    else Object.assign(payload, { unit: form.get("unit"), standardSalesPrice: Number(form.get("standardSalesPrice")), standardCostPrice: Number(form.get("standardCostPrice")) });
    if (row) payload.version = row.version;
    try {
      const response = await fetch(`/api/${type === "site" ? "sites" : "items"}${row ? `/${row.id}` : ""}`, { method: row ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? `${title}을 저장하지 못했습니다.`);
      toast.success(`${title}을 저장했습니다.`); onOpenChange(false); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : `${title}을 저장하지 못했습니다.`); }
    finally { setSaving(false); }
  }
  const site = type === "site" ? row as SiteView | null : null; const item = type === "item" ? row as ItemView | null : null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{title} {row ? "수정" : "추가"}</DialogTitle><DialogDescription>코드를 비워 두면 순번에 따라 자동 생성됩니다. 이름과 별칭은 다른 코드와 중복될 수 없습니다.</DialogDescription></DialogHeader><form key={row?.id ?? "new"} className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
    <Field label={`${title} 코드`} name="code" defaultValue={row?.code ?? ""} placeholder="비우면 자동 생성" /><Field label={`${title}명`} name="name" defaultValue={row?.name ?? ""} required />
    {type === "site" ? <><Field label="거래처" name="customerName" defaultValue={site?.customerName ?? ""} /><Field label="주소" name="address" defaultValue={site?.address ?? ""} /><Field label="담당자" name="managerName" defaultValue={site?.managerName ?? ""} /><Field label="연락처" name="managerContact" defaultValue={site?.managerContact ?? ""} /><Field label="시작일" name="startDate" type="date" defaultValue={site?.startDate?.slice(0, 10) ?? ""} /><Field label="종료일" name="endDate" type="date" defaultValue={site?.endDate?.slice(0, 10) ?? ""} /></> : <><Field label="단위" name="unit" defaultValue={item?.unit ?? "EA"} required /><Field label="표준 매출단가" name="standardSalesPrice" type="number" min="0" defaultValue={String(item?.standardSalesPrice ?? 0)} required /><Field label="표준 매입단가" name="standardCostPrice" type="number" min="0" defaultValue={String(item?.standardCostPrice ?? 0)} required /></>}
    <Field className="sm:col-span-2" label="별칭" name="aliases" defaultValue={row?.aliases.join("|") ?? ""} placeholder="여러 값은 | 로 구분" /><Field className="sm:col-span-2" label="메모" name="memo" defaultValue={row?.memo ?? ""} />
    <label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" defaultChecked={row?.isActive ?? true} />사용 중</label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></div>
  </form></DialogContent></Dialog>;
}

function Field({ label, className = "", ...props }: React.ComponentProps<typeof Input> & { label: string; className?: string }) {
  const id = String(props.name); return <div className={`space-y-1.5 ${className}`}><Label htmlFor={id}>{label}</Label><Input id={id} {...props} /></div>;
}

function ImportDialog({ type, open, onOpenChange, onCommitted }: { type: MasterType; open: boolean; onOpenChange: (open: boolean) => void; onCommitted: () => void }) {
  const [source, setSource] = useState<"file" | "paste">("file"); const [file, setFile] = useState<File | null>(null); const [content, setContent] = useState(""); const [preview, setPreview] = useState<Preview | null>(null); const [allOrNothing, setAllOrNothing] = useState(false); const [busy, setBusy] = useState(false);
  const endpoint = type === "site" ? "sites" : "items"; const title = type === "site" ? "현장" : "품목";
  function requestBody() { const mode = allOrNothing ? "allOrNothing" : "validOnly"; if (source === "file") { const body = new FormData(); if (file) body.set("file", file); body.set("mode", mode); return { body }; } return { body: JSON.stringify({ content, mode }), headers: { "Content-Type": "application/json" } }; }
  async function call(action: "preview" | "commit") { setBusy(true); try { const response = await fetch(`/api/${endpoint}/import/${action}`, { method: "POST", ...requestBody() }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "가져오기를 처리하지 못했습니다."); if (action === "preview") setPreview(body); else { toast.success(`${body.counts.create}건 추가, ${body.counts.update}건 수정했습니다.`); setPreview(null); onOpenChange(false); onCommitted(); } } catch (error) { toast.error(error instanceof Error ? error.message : "가져오기를 처리하지 못했습니다."); } finally { setBusy(false); } }
  return <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) setPreview(null); }}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{title} 마스터 Excel 가져오기</DialogTitle><DialogDescription>파일 업로드와 Excel 범위 복사·붙여넣기는 동일한 검증 규칙을 사용합니다. 미리보기 후 저장하세요.</DialogDescription></DialogHeader>
    <div className="flex gap-2"><Button type="button" variant={source === "file" ? "default" : "outline"} onClick={() => { setSource("file"); setPreview(null); }}>파일</Button><Button type="button" variant={source === "paste" ? "default" : "outline"} onClick={() => { setSource("paste"); setPreview(null); }}>복사·붙여넣기</Button></div>
    {source === "file" ? <div className="space-y-2"><Label htmlFor={`${type}-file`}>Excel 파일 (.xlsx)</Label><Input id={`${type}-file`} type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} /></div> : <div className="space-y-2"><Label htmlFor={`${type}-paste`}>헤더를 포함한 Excel 데이터</Label><textarea id={`${type}-paste`} value={content} onChange={(event) => { setContent(event.target.value); setPreview(null); }} rows={8} className="w-full rounded-lg border bg-background p-3 font-mono text-xs" placeholder="양식의 헤더 행부터 복사해 붙여넣으세요." /></div>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allOrNothing} onChange={(event) => setAllOrNothing(event.target.checked)} />오류 행이 하나라도 있으면 전체 저장 취소</label>
    <div className="flex justify-end"><Button disabled={busy || (source === "file" ? !file : !content.trim())} onClick={() => void call("preview")}>{busy ? "검증 중..." : "미리보기"}</Button></div>
    {preview && <div className="space-y-3"><div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5"><Count label="전체" value={preview.counts.total} /><Count label="추가" value={preview.counts.create} /><Count label="수정" value={preview.counts.update} /><Count label="변경 없음" value={preview.counts.unchanged} /><Count label="오류" value={preview.counts.error} error /></div><div className="max-h-72 overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>행</TableHead><TableHead>상태</TableHead><TableHead>코드</TableHead><TableHead>이름</TableHead><TableHead>검증 결과</TableHead></TableRow></TableHeader><TableBody>{preview.rows.map((row) => <TableRow key={row.rowNumber}><TableCell>{row.rowNumber}</TableCell><TableCell><Badge variant={row.status === "ERROR" ? "destructive" : "outline"}>{row.status}</Badge></TableCell><TableCell className="font-mono text-xs">{row.code}</TableCell><TableCell>{row.name}</TableCell><TableCell className="text-xs text-destructive">{row.errors.join(" ") || "정상"}</TableCell></TableRow>)}</TableBody></Table></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button disabled={busy || (allOrNothing && preview.counts.error > 0) || preview.counts.create + preview.counts.update === 0} onClick={() => void call("commit")}>{busy ? "저장 중..." : "검증된 행 저장"}</Button></div></div>}
  </DialogContent></Dialog>;
}
function Count({ label, value, error = false }: { label: string; value: number; error?: boolean }) { return <div className={`rounded-lg border p-2 ${error && value ? "border-red-200 bg-red-50 text-red-700" : "bg-slate-50"}`}><span className="block text-xs text-muted-foreground">{label}</span><strong>{value}</strong></div>; }
