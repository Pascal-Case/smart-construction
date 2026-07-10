import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center text-center">
      <p className="text-sm font-semibold text-teal-700">404</p>
      <h1 className="mt-2 text-2xl font-semibold">요청한 화면을 찾을 수 없습니다.</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        주소가 올바른지 확인하거나 대시보드로 돌아가 주세요.
      </p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>
        대시보드로 이동
      </Link>
    </div>
  );
}
