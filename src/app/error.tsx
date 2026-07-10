"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold text-destructive">예상하지 못한 오류</p>
      <h1 className="mt-2 text-2xl font-semibold">화면을 불러오지 못했습니다.</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        잠시 후 다시 시도해 주세요. 같은 문제가 반복되면 관리자에게 알려주세요.
      </p>
      <Button className="mt-6" onClick={() => unstable_retry()}>
        다시 시도
      </Button>
    </div>
  );
}
