"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ContractCategoryView = { id: string; code: string; name: string; isActive: boolean; version: number };

export function ContractCategoryManager({ initialCategories }: { initialCategories: ContractCategoryView[] }) {
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function reload() {
    const response = await fetch("/api/contract-categories");
    const body = await response.json();
    if (response.ok) setCategories(body.categories);
  }
  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/contract-categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "계약 구분을 추가하지 못했습니다.");
      setName("");
      await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "계약 구분을 추가하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function update(category: ContractCategoryView, changes: { name?: string; isActive?: boolean }) {
    setBusy(true);
    try {
      const response = await fetch(`/api/contract-categories/${category.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...changes, version: category.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "계약 구분을 수정하지 못했습니다.");
      await reload();
    } catch (error) { toast.error(error instanceof Error ? error.message : "계약 구분을 수정하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function rename(category: ContractCategoryView) {
    const nextName = window.prompt("계약 구분명", category.name);
    if (!nextName || nextName.trim() === category.name) return;
    await update(category, { name: nextName });
  }
  return <div className="space-y-4">
    <div className="flex gap-2 rounded-xl border bg-card p-4"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="새 계약 구분명" /><Button disabled={busy || !name.trim()} onClick={() => void create()}>추가</Button></div>
    <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>코드</TableHead><TableHead>계약 구분명</TableHead><TableHead>상태</TableHead><TableHead className="text-right">관리</TableHead></TableRow></TableHeader><TableBody>
      {categories.map((category) => <TableRow key={category.id}><TableCell className="font-mono text-xs">{category.code}</TableCell><TableCell>{category.name}</TableCell><TableCell><Badge variant={category.isActive ? "secondary" : "outline"}>{category.isActive ? "사용" : "중지"}</Badge></TableCell><TableCell className="space-x-2 text-right"><Button size="sm" variant="outline" disabled={busy} onClick={() => void rename(category)}>명칭 수정</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void update(category, { isActive: !category.isActive })}>{category.isActive ? "중지" : "재사용"}</Button></TableCell></TableRow>)}
    </TableBody></Table></div>
  </div>;
}
