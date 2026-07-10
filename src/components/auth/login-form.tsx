"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        const data = new FormData(event.currentTarget);
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loginId: data.get("loginId"), password: data.get("password") }),
        });
        const body = await response.json();
        if (!response.ok) {
          setError(body.error?.message ?? "로그인하지 못했습니다.");
          setPending(false);
          return;
        }
        router.replace("/");
        router.refresh();
      }}
    >
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="loginId">아이디</Label><Input id="loginId" name="loginId" autoComplete="username" required autoFocus /></div>
      <div className="space-y-2"><Label htmlFor="password">비밀번호</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      <Button type="submit" className="w-full" size="lg" disabled={pending}>{pending ? "로그인 중..." : "로그인"}</Button>
    </form>
  );
}
