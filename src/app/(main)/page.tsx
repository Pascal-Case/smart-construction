import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  FileText,
  Radio,
  ReceiptText,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RevenueStatus } from "@/generated/prisma/client";
import { PhaseReadyToast } from "@/components/phase-ready-toast";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";

const workflows = [
  { title: "현장·품목 마스터", description: "Excel과 복사·붙여넣기로 기준정보를 관리합니다.", href: "/masters/sites", icon: Building2 },
  { title: "계약·매출 원장", description: "일할 계약 매출과 자유형·조정 매출을 건별 관리합니다.", href: "/revenues", icon: ReceiptText },
  { title: "월별 현황·메모", description: "현장별 청구액, 상세 내역과 월 공유 메모를 확인합니다.", href: "/reports/monthly", icon: BarChart3 },
  { title: "거래명세표", description: "확정 매출을 선택해 snapshot으로 발행하고 재출력합니다.", href: "/invoices", icon: FileText },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [siteCount, itemCount, contractCount, revenue, invoiceCount, lastMigration] = await Promise.all([
    prisma.site.count({ where: { isActive: true } }),
    prisma.item.count({ where: { isActive: true } }),
    prisma.contract.count({ where: { status: "ACTIVE" } }),
    prisma.revenueEntry.aggregate({ where: { status: { not: RevenueStatus.CANCELED } }, _count: true, _sum: { salesAmount: true } }),
    prisma.invoiceDocument.count(),
    prisma.legacyMigrationBatch.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, sourceName: true } }),
  ]);

  const metrics = [
    { label: "사용 현장", value: `${siteCount.toLocaleString()}개` },
    { label: "사용 품목", value: `${itemCount.toLocaleString()}개` },
    { label: "진행 계약", value: `${contractCount.toLocaleString()}건` },
    { label: "유효 매출", value: `${revenue._count.toLocaleString()}건` },
    { label: "매출 합계", value: `${(revenue._sum.salesAmount ?? 0).toLocaleString()}원` },
    { label: "발행 명세표", value: `${invoiceCount.toLocaleString()}건` },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 px-6 py-8 text-white shadow-xl shadow-slate-900/5 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge className="border-white/15 bg-white/10 text-teal-50">Phase 11 구현 완료 · 실무 인수 진행</Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">현장 매출·청구 업무를 한곳에서 관리합니다.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">마스터, 계약, 건별 매출, 월 메모, Excel, 거래명세표와 실시간 협업이 하나의 SQLite 원장에 연결되어 있습니다.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/api/health" target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg" }), "bg-teal-400 text-slate-950 hover:bg-teal-300")}>
              <Radio data-icon="inline-start" />서버 상태<ArrowUpRight data-icon="inline-end" />
            </a>
            <PhaseReadyToast />
          </div>
        </div>
      </section>

      <section aria-labelledby="summary-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><h2 id="summary-title" className="text-xl font-semibold tracking-tight">현재 업무 데이터</h2><p className="mt-1 text-sm text-muted-foreground">취소 매출은 유효 매출 건수와 합계에서 제외합니다.</p></div>
          <Badge variant="secondary">실시간 DB 기준</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => <Card key={metric.label} className="bg-card shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">{metric.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{metric.value}</p></CardContent></Card>)}
        </div>
      </section>

      <section aria-labelledby="workflow-title">
        <div className="mb-4"><h2 id="workflow-title" className="text-xl font-semibold tracking-tight">업무 바로가기</h2><p className="mt-1 text-sm text-muted-foreground">기준정보부터 청구서 발행까지 실제 업무 순서로 이동합니다.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          {workflows.map((workflow) => <Link key={workflow.href} href={workflow.href} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><Card className="h-full bg-card shadow-sm transition-colors group-hover:border-teal-300"><CardHeader><div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><workflow.icon className="size-5" /></div><CardTitle className="flex items-center justify-between">{workflow.title}<ArrowUpRight className="size-4 text-muted-foreground" /></CardTitle><CardDescription>{workflow.description}</CardDescription></CardHeader></Card></Link>)}
        </div>
      </section>

      <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
        <CardHeader><CardTitle>실무 인수에서 확인할 항목</CardTitle><CardDescription>기능 구현과 자동 검증은 완료됐으며 실제 운영 환경 증빙을 남겨야 합니다.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-lg border bg-card/80 p-3"><Upload className="mb-2 size-4 text-amber-700" /><p className="font-medium">실제 데이터 이관</p><p className="mt-1 text-xs text-muted-foreground">업무 JSON·Excel의 건수와 월 합계를 대조합니다.</p></div>
          <div className="rounded-lg border bg-card/80 p-3"><Boxes className="mb-2 size-4 text-amber-700" /><p className="font-medium">서버·팀원 PC</p><p className="mt-1 text-xs text-muted-foreground">재부팅 자동 시작과 사내 IP 접속·실시간 갱신을 확인합니다.</p></div>
          <div className="rounded-lg border bg-card/80 p-3"><FileText className="mb-2 size-4 text-amber-700" /><p className="font-medium">A4 출력 승인</p><p className="mt-1 text-xs text-muted-foreground">실제 공급자 데이터로 PDF 여백·서체·잘림을 승인합니다.</p></div>
        </CardContent>
      </Card>

      {user.role === "ADMIN" && <div className="flex items-center justify-between rounded-xl border bg-card p-4 text-sm"><div><p className="font-medium">최근 데이터 이관</p><p className="text-xs text-muted-foreground">{lastMigration ? `${lastMigration.sourceName ?? "이름 없음"} · ${lastMigration.createdAt.toLocaleString("ko-KR")}` : "아직 이관 이력이 없습니다."}</p></div><Link href="/settings/migration" className={buttonVariants({ variant: "outline" })}>이관 관리</Link></div>}
    </div>
  );
}
