import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CircleDollarSign,
  FileText,
  FileWarning,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RevenueStatus } from "@/generated/prisma/client";
import { ServerStatusButton } from "@/components/dashboard/server-status-button";
import { YearlySalesChart } from "@/components/dashboard/yearly-sales-chart";
import { PhaseReadyToast } from "@/components/phase-ready-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { buildDashboardActionDesk } from "@/lib/dashboard/action-desk";
import { formatRecentAction } from "@/lib/dashboard/recent-actions";
import { buildDashboardSummary, dashboardYearRange } from "@/lib/dashboard/summary";
import { prisma } from "@/lib/db/prisma";

const workflows = [
  { title: "현장·품목 마스터", description: "Excel과 복사·붙여넣기로 기준정보를 관리합니다.", href: "/masters/sites", icon: Building2 },
  { title: "계약·매출 원장", description: "일할 계약 매출과 자유형·조정 매출을 건별 관리합니다.", href: "/revenues", icon: ReceiptText },
  { title: "월별 현황·메모", description: "현장별 청구액, 상세 내역과 월 공유 메모를 확인합니다.", href: "/reports/monthly", icon: BarChart3 },
  { title: "거래명세표", description: "확정 매출을 선택해 snapshot으로 발행하고 재출력합니다.", href: "/invoices", icon: FileText },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { year, startDate, endDate } = dashboardYearRange();

  const [siteCount, revenues, invoiceCount, auditLogs, actionRevenues] = await Promise.all([
    prisma.site.count({ where: { isActive: true } }),
    prisma.revenueEntry.findMany({
      where: { revenueDate: { gte: startDate, lt: endDate }, status: { not: RevenueStatus.CANCELED } },
      select: { revenueDate: true, salesAmount: true, costAmount: true, status: true },
    }),
    prisma.invoiceDocument.count({ where: { issueDate: { gte: startDate, lt: endDate } } }),
    prisma.auditLog.findMany({
      where: { entityType: { in: ["SITE", "ITEM", "CONTRACT", "REVENUE", "INVOICE", "MONTHLY_MEMO"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, actorName: true, action: true, entityType: true, afterJson: true, createdAt: true },
    }),
    prisma.revenueEntry.findMany({
      where: {
        OR: [
          { status: RevenueStatus.DRAFT },
          { salesAmount: 0, status: { not: RevenueStatus.CANCELED } },
          { status: RevenueStatus.CONFIRMED, invoiceLinks: { none: {} } },
        ],
      },
      select: {
        revenueDate: true,
        salesAmount: true,
        status: true,
        _count: { select: { invoiceLinks: true } },
      },
    }),
  ]);
  const summary = buildDashboardSummary({ year, siteCount, invoiceCount, revenues });
  const actionDesk = buildDashboardActionDesk(actionRevenues.map((row) => ({ ...row, invoiceLinkCount: row._count.invoiceLinks })));
  const recentActions = auditLogs.map((log) => ({ ...log, message: formatRecentAction(log) }));

  const metrics = [
    { label: "관리 현장 수", value: `${summary.siteCount.toLocaleString()}개` },
    { label: "총 매출", value: `${summary.totalSales.toLocaleString()}원` },
    { label: "매출이익", value: `${summary.totalProfit.toLocaleString()}원` },
    { label: "명세표 발행 건수", value: `${summary.invoiceCount.toLocaleString()}건` },
  ];
  const actionCards = [
    { label: "작성 중 매출", description: "확정 전 검토가 필요한 매출", href: "/revenues?status=DRAFT", icon: FileWarning, summary: actionDesk.draft, showAmount: true },
    { label: "0원 매출", description: "금액 또는 단가 확인이 필요한 매출", href: "/revenues?exception=ZERO", icon: AlertCircle, summary: actionDesk.zero, showAmount: false },
    { label: "확정 후 미발행", description: "거래명세표 발행을 기다리는 매출", href: "/invoices#new-issue", icon: CircleDollarSign, summary: actionDesk.unissued, showAmount: true },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 px-6 py-8 text-white shadow-xl shadow-slate-900/5 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge className="border-white/15 bg-white/10 text-teal-50">실무 운영 화면</Badge>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">현장별 매출관리·거래명세표 청구 업무를 한곳에서 관리해 보세요!</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <ServerStatusButton />
            <PhaseReadyToast />
          </div>
        </div>
      </section>

      <section aria-labelledby="action-desk-title">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold text-teal-700">업무 우선순위</p><h2 id="action-desk-title" className="text-xl font-semibold tracking-tight">오늘의 조치 데스크</h2></div>
          <p className="text-sm text-muted-foreground">예외가 있는 항목만 확인하고 해당 작업 화면으로 이동합니다.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {actionCards.map((action) => (
            <Link key={action.label} href={action.href} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className={`h-full shadow-sm transition-colors group-hover:border-teal-300 ${action.summary.count ? "border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20" : "bg-card"}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200"><action.icon className="size-5" aria-hidden="true" /></div><ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></div>
                  <p className="mt-4 text-sm font-medium">{action.label}</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{action.summary.count.toLocaleString()}건</p>
                  <p className="mt-1 text-xs text-muted-foreground">{action.description}</p>
                  <p className="mt-4 text-xs font-medium text-teal-800 dark:text-teal-200">{action.summary.count ? `${action.showAmount ? `${action.summary.amount.toLocaleString()}원 · ` : ""}가장 오래된 항목 ${formatActionDate(action.summary.oldestDate)}` : "현재 처리할 항목이 없습니다."}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="summary-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="summary-title" className="text-xl font-semibold tracking-tight">{year}년 업무 현황</h2>
          <Badge variant="secondary">올해 기준</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => <Card key={metric.label} className="bg-card shadow-sm"><CardContent className="p-5"><p className="text-xs text-muted-foreground">{metric.label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{metric.value}</p></CardContent></Card>)}
        </div>
        <Card className="mt-4 bg-card shadow-sm">
          <CardHeader><CardTitle>월간 매출과 매출이익</CardTitle><CardDescription>{year}/01 ~ {year}/12</CardDescription></CardHeader>
          <CardContent><YearlySalesChart year={year} months={summary.months} /></CardContent>
        </Card>
      </section>

      <section aria-labelledby="workflow-title">
        <div className="mb-4"><h2 id="workflow-title" className="text-xl font-semibold tracking-tight">업무 바로가기</h2><p className="mt-1 text-sm text-muted-foreground">기준정보부터 청구서 발행까지 실제 업무 순서로 이동합니다.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          {workflows.map((workflow) => <Link key={workflow.href} href={workflow.href} className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><Card className="h-full bg-card shadow-sm transition-colors group-hover:border-teal-300"><CardHeader><div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><workflow.icon className="size-5" /></div><CardTitle className="flex items-center justify-between">{workflow.title}<ArrowUpRight className="size-4 text-muted-foreground" /></CardTitle><CardDescription>{workflow.description}</CardDescription></CardHeader></Card></Link>)}
        </div>
      </section>

      <section aria-labelledby="recent-actions-title">
        <div className="mb-4 flex items-center gap-2"><Activity className="size-5 text-teal-600" aria-hidden="true" /><h2 id="recent-actions-title" className="text-xl font-semibold tracking-tight">최근 액션 현황</h2></div>
        <Card className="bg-card shadow-sm"><CardContent className="p-0">
          {recentActions.length ? <ol className="divide-y">{recentActions.map((action) => <li key={action.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium">{action.message}</p><time dateTime={action.createdAt.toISOString()} className="shrink-0 text-xs text-muted-foreground">{action.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}</time></li>)}</ol> : <p className="px-5 py-8 text-center text-sm text-muted-foreground">아직 표시할 업무 활동이 없습니다.</p>}
        </CardContent></Card>
      </section>
    </div>
  );
}

function formatActionDate(value: Date | null) {
  return value?.toLocaleDateString("ko-KR", { timeZone: "UTC", month: "2-digit", day: "2-digit" }) ?? "-";
}
