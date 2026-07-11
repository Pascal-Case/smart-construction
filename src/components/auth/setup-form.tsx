"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault(); setPending(true); setError("");
      const data = new FormData(event.currentTarget);
      const response = await fetch("/api/auth/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loginId: data.get("loginId"), name: data.get("name"), password: data.get("password") }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error?.message ?? "초기 설정에 실패했습니다."); setPending(false); return; }
      router.replace("/"); router.refresh();
    }}>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="name">관리자 이름</Label><Input id="name" name="name" required autoFocus /></div>
      <div className="space-y-2"><Label htmlFor="loginId">관리자 아이디</Label><Input id="loginId" name="loginId" autoComplete="username" required /><p className="text-xs text-muted-foreground">영문 소문자, 숫자, . _ - 조합 3자 이상</p></div>
      <div className="space-y-2"><Label htmlFor="password">비밀번호</Label><Input id="password" name="password" type="password" autoComplete="new-password" minLength={5} required /><p className="text-xs text-muted-foreground">영문과 숫자를 포함한 5자 이상</p></div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? "설정 중..." : "관리자 계정 생성"}</Button>
    </form>
  );
}
