"use client";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ko">
      <body className="flex min-h-svh items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-teal-300">시스템 오류</p>
          <h1 className="mt-2 text-2xl font-semibold">애플리케이션을 시작하지 못했습니다.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            환경설정과 서버 상태를 확인한 뒤 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="mt-6 rounded-lg bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
