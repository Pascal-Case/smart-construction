"use client";

import {
  BarChart3,
  Boxes,
  Building2,
  FileSpreadsheet,
  FileText,
  HardHat,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings2,
  StickyNote,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { SessionUser } from "@/lib/auth/dto";
import { LogoutButton } from "@/components/logout-button";
import { RealtimeProvider, RealtimeStatus } from "@/components/realtime-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const navigation = [
  { label: "대시보드", icon: LayoutDashboard, href: "/" },
  { label: "현장 마스터", icon: Building2, href: "/masters/sites" },
  { label: "품목 마스터", icon: Boxes, href: "/masters/items" },
  { label: "계약 관리", icon: FileSpreadsheet, href: "/contracts" },
  { label: "매출 원장", icon: ReceiptText, href: "/revenues" },
  { label: "월별 현황", icon: BarChart3, href: "/reports/monthly" },
  { label: "거래명세표", icon: FileText, href: "/invoices" },
];

const adminNavigation = [
  { label: "사용자 관리", icon: Settings2, href: "/settings/users" },
  { label: "감사 로그", icon: StickyNote, href: "/settings/audit" },
  { label: "공급자 정보", icon: FileText, href: "/settings/company" },
  { label: "기존 데이터 이관", icon: Upload, href: "/settings/migration" },
];

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <RealtimeProvider>
      <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="대시보드로 이동" className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <span className="flex size-9 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <HardHat className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold tracking-tight">스마트 건설안전</p>
              <p className="text-xs text-muted-foreground">매출·청구 관리 시스템</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.role}</p>
            </div>
            <RealtimeStatus />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className={cn("mx-auto grid max-w-[1600px] transition-[grid-template-columns]", sidebarCollapsed ? "md:grid-cols-[72px_1fr]" : "md:grid-cols-[240px_1fr]")}>
        <aside className="hidden min-h-[calc(100svh-4rem)] border-r bg-card p-4 md:block">
          <div className={cn("mb-2 flex items-center", sidebarCollapsed ? "justify-center" : "justify-between px-2")}>
            {!sidebarCollapsed && <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">업무 메뉴</p>}
            <Button type="button" size="icon-sm" variant="ghost" aria-label={sidebarCollapsed ? "좌측 메뉴 펼치기" : "좌측 메뉴 접기"} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}>
              {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            </Button>
          </div>
          <nav aria-label="주요 업무">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.label}>
                  <Link href={item.href} title={sidebarCollapsed ? item.label : undefined} className={cn("flex items-center rounded-lg px-2.5 py-2 text-sm hover:bg-muted", sidebarCollapsed ? "justify-center" : "gap-3")}>
                    <item.icon className="size-4" aria-hidden="true" />
                    <span className={sidebarCollapsed ? "sr-only" : "flex-1"}>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Separator className="my-4" />
          {user.role === "ADMIN" && (
            <div className="space-y-1">
              {adminNavigation.map((item) => <Link key={item.href} href={item.href} title={sidebarCollapsed ? item.label : undefined} className={cn("flex items-center rounded-lg px-2.5 py-2 text-sm hover:bg-muted", sidebarCollapsed ? "justify-center" : "gap-3")}><item.icon className="size-4" aria-hidden="true" /><span className={sidebarCollapsed ? "sr-only" : undefined}>{item.label}</span></Link>)}
            </div>
          )}
        </aside>

        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      </div>
    </RealtimeProvider>
  );
}
