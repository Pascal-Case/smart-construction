"use client";

import { Radio } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function ServerStatusButton() {
  const [checking, setChecking] = useState(false);

  async function checkStatus() {
    setChecking(true);
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const result = await response.json() as { status?: string; database?: string };
      if (!response.ok || result.status !== "ok" || result.database !== "connected") throw new Error("unhealthy");
      toast.success("서버가 정상 작동 중입니다.", { description: "데이터베이스 연결도 정상입니다." });
    } catch {
      toast.error("서버 상태를 확인할 수 없습니다.", { description: "잠시 후 다시 시도하거나 관리자에게 문의하세요." });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Button type="button" size="lg" disabled={checking} onClick={() => void checkStatus()} className="bg-teal-400 text-slate-950 hover:bg-teal-300">
      <Radio data-icon="inline-start" />
      {checking ? "확인 중..." : "서버 상태"}
    </Button>
  );
}
