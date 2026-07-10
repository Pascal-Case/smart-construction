import {
  BarChart3,
  Boxes,
  Building2,
  FileSpreadsheet,
  HardHat,
  ReceiptText,
  Settings2,
  StickyNote,
} from "lucide-react";
import Link from "next/link";

import type { SessionUser } from "@/lib/auth/dto";
import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const navigation = [
  { label: "현장 마스터", icon: Building2, phase: "Phase 3", href: "/masters/sites" },
  { label: "품목 마스터", icon: Boxes, phase: "Phase 3", href: "/masters/items" },
  { label: "계약 관리", icon: FileSpreadsheet, phase: "Phase 4", href: "/contracts" },
  { label: "매출 원장", icon: ReceiptText, phase: "Phase 5", href: "/revenues" },
  { label: "월별 현황", icon: BarChart3, phase: "Phase 6" },
  { label: "월별 메모", icon: StickyNote, phase: "Phase 6" },
];

export function AppShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  return (
    <div className="min-h-svh bg-slate-50/70">
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <HardHat className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold tracking-tight">스마트 건설안전</p>
              <p className="text-xs text-muted-foreground">매출·청구 관리 시스템</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.role}</p>
            </div>
            <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-800">Phase 5</Badge>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] md:grid-cols-[240px_1fr]">
        <aside className="hidden min-h-[calc(100svh-4rem)] border-r bg-white p-4 md:block">
          <p className="px-2 pb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            업무 메뉴
          </p>
          <nav aria-label="주요 업무">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.label}>
                  {item.href ? <Link href={item.href} className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-100">
                    <item.icon className="size-4" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[10px] text-slate-400">{item.phase}</span>
                  </Link> : <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground"><item.icon className="size-4" aria-hidden="true" /><span className="flex-1">{item.label}</span><span className="text-[10px] text-slate-400">{item.phase}</span></div>}
                </li>
              ))}
            </ul>
          </nav>
          <Separator className="my-4" />
          {user.role === "ADMIN" && (
            <div className="space-y-1">
              <Link href="/settings/users" className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-100">
                <Settings2 className="size-4" aria-hidden="true" /> 사용자 관리
              </Link>
              <Link href="/settings/audit" className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-100">
                <StickyNote className="size-4" aria-hidden="true" /> 감사 로그
              </Link>
            </div>
          )}
        </aside>

        <main className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
