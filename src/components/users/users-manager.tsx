"use client";

import { Plus, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ManagedUserView = {
  id: string; loginId: string; name: string; role: "ADMIN" | "MANAGER" | "VIEWER";
  isActive: boolean; version: number; lastLoginAt: string | null; createdAt: string; updatedAt: string;
};

const roles = ["ADMIN", "MANAGER", "VIEWER"] as const;

export function UsersManager({ initialUsers }: { initialUsers: ManagedUserView[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [open, setOpen] = useState(false);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data)) });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error?.message ?? "사용자를 추가하지 못했습니다.");
    setUsers((current) => [...current, { ...body.user, lastLoginAt: body.user.lastLoginAt, createdAt: body.user.createdAt, updatedAt: body.user.updatedAt }]);
    setOpen(false); toast.success("사용자를 추가했습니다.");
  }

  async function saveUser(user: ManagedUserView, form: HTMLFormElement) {
    const data = new FormData(form);
    const payload = { name: data.get("name"), role: data.get("role"), isActive: data.get("isActive") === "on", version: user.version, password: data.get("password") };
    const response = await fetch(`/api/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) return toast.error(body.error?.message ?? "사용자를 수정하지 못했습니다.");
    setUsers((current) => current.map((item) => item.id === user.id ? body.user : item));
    form.reset(); toast.success("사용자 정보를 저장했습니다.");
  }

  return <div className="space-y-4">
    <div className="flex justify-end"><Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button />}><Plus data-icon="inline-start" />사용자 추가</DialogTrigger><DialogContent><DialogHeader><DialogTitle>사용자 추가</DialogTitle><DialogDescription>초기 비밀번호는 사용자에게 안전하게 전달하세요.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={createUser}><Field label="이름" name="name" /><Field label="아이디" name="loginId" /><Field label="초기 비밀번호" name="password" type="password" /><div className="space-y-2"><Label htmlFor="create-role">역할</Label><select id="create-role" name="role" className="h-9 w-full rounded-lg border bg-background px-3 text-sm">{roles.map((role) => <option key={role}>{role}</option>)}</select></div><Button type="submit" className="w-full">추가</Button></form></DialogContent></Dialog></div>
    <div className="overflow-x-auto rounded-xl border bg-white"><Table><TableHeader><TableRow><TableHead>아이디</TableHead><TableHead>이름</TableHead><TableHead>역할</TableHead><TableHead>상태</TableHead><TableHead>새 비밀번호</TableHead><TableHead className="text-right">관리</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell className="font-medium">{user.loginId}</TableCell><TableCell colSpan={5}><form className="grid grid-cols-[1fr_130px_90px_1fr_auto] items-center gap-3" onSubmit={(event) => { event.preventDefault(); void saveUser(user, event.currentTarget); }}><Input name="name" defaultValue={user.name} required /><select name="role" defaultValue={user.role} className="h-9 rounded-lg border bg-background px-2 text-sm">{roles.map((role) => <option key={role}>{role}</option>)}</select><label className="flex items-center gap-2 text-sm"><input name="isActive" type="checkbox" defaultChecked={user.isActive} />사용</label><Input name="password" type="password" placeholder="변경 시에만 입력" /><Button type="submit" size="sm" variant="outline"><Save data-icon="inline-start" />저장</Button></form></TableCell></TableRow>)}</TableBody></Table></div>
    <p className="text-xs text-muted-foreground">역할: ADMIN 전체 관리 · MANAGER 업무 입력 · VIEWER 조회</p>
  </div>;
}

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return <div className="space-y-2"><Label htmlFor={`create-${name}`}>{label}</Label><Input id={`create-${name}`} name={name} type={type} required /></div>;
}
