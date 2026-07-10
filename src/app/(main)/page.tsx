import {
  ArrowUpRight,
  Clock3,
  Database,
  Radio,
  Server,
  ShieldCheck,
} from "lucide-react";
import { redirect } from "next/navigation";

import { PhaseReadyToast } from "@/components/phase-ready-toast";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";

const foundations = [
  {
    title: "애플리케이션",
    description: "Next.js App Router · TypeScript · Tailwind CSS",
    icon: Server,
  },
  {
    title: "데이터베이스",
    description: "Prisma · SQLite · WAL · busy timeout",
    icon: Database,
  },
  {
    title: "UI 기반",
    description: "shadcn/ui · 반응형 공통 레이아웃 · toast",
    icon: ShieldCheck,
  },
];

export default async function HomePage() {
  if (!(await getCurrentUser())) redirect("/login");
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 px-6 py-8 text-white shadow-xl shadow-slate-900/5 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge className="border-white/15 bg-white/10 text-teal-50">
              인증·권한 적용 완료
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                안전한 공동 업무 기반을 준비했습니다.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                DB 세션과 역할 권한, 사용자 관리와 감사 로그를 적용했습니다.
                다음 단계부터 현장·품목 마스터를 연결합니다.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-teal-400 text-slate-950 hover:bg-teal-300",
              )}
            >
              <Radio data-icon="inline-start" />
              서버 상태 확인
              <ArrowUpRight data-icon="inline-end" />
            </a>
            <PhaseReadyToast />
          </div>
        </div>
      </section>

      <section aria-labelledby="foundation-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 id="foundation-title" className="text-xl font-semibold tracking-tight">
              Phase 1 기반 구성
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              업무 기능 구현 전에 공통으로 필요한 실행 기반입니다.
            </p>
          </div>
          <Badge variant="secondary">
            <Clock3 className="size-3" aria-hidden="true" />
            검증 진행 중
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {foundations.map((foundation) => (
            <Card key={foundation.title} className="bg-white shadow-sm">
              <CardHeader>
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <foundation.icon className="size-5" aria-hidden="true" />
                </div>
                <CardTitle>{foundation.title}</CardTitle>
                <CardDescription>{foundation.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <Card className="bg-white shadow-sm">
        <CardHeader>
          <CardTitle>다음 구현 순서</CardTitle>
          <CardDescription>
            Phase 2 인증·권한·감사가 완료되어 업무 데이터 구현으로 이동합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 text-sm sm:grid-cols-3">
            {["현장·품목 마스터", "계약과 매출 원장", "월별 현황과 출력"].map(
              (item, index) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-xl border bg-slate-50 px-4 py-3"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                    {index + 3}
                  </span>
                  <span className="font-medium">{item}</span>
                </li>
              ),
            )}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
