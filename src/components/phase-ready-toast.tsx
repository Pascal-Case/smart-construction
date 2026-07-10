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
        toast.success("공통 알림이 정상적으로 연결되었습니다.", {
          description: "이 알림 영역은 이후 저장·오류 결과에 공통 사용됩니다.",
        })
      }
    >
      <CheckCircle2 data-icon="inline-start" />
      알림 동작 확인
    </Button>
  );
}
