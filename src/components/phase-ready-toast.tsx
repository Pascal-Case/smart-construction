"use client";

import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function PhaseReadyToast() {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={() =>
        toast.success("업무 알림이 정상적으로 연결되었습니다.", {
          description: "저장·오류·실시간 동기화 결과가 이 영역에 표시됩니다.",
        })
      }
    >
      <CheckCircle2 data-icon="inline-start" />
      알림 확인
    </Button>
  );
}
