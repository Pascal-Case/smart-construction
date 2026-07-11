import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function AuditPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.role !== "ADMIN") redirect("/");
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return <div className="mx-auto max-w-6xl space-y-6"><div><p className="text-sm font-semibold text-teal-700">설정</p><h1 className="text-2xl font-semibold">감사 로그</h1><p className="mt-1 text-sm text-muted-foreground">최근 인증과 사용자 변경 200건을 확인합니다.</p></div><div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>일시</TableHead><TableHead>사용자</TableHead><TableHead>작업</TableHead><TableHead>대상</TableHead><TableHead>대상 ID</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => <TableRow key={log.id}><TableCell className="whitespace-nowrap">{log.createdAt.toLocaleString("ko-KR")}</TableCell><TableCell>{log.actorName ?? "시스템"}</TableCell><TableCell><Badge variant="outline">{log.action}</Badge></TableCell><TableCell>{log.entityType}</TableCell><TableCell className="max-w-52 truncate font-mono text-xs">{log.entityId ?? "-"}</TableCell></TableRow>)}</TableBody></Table></div></div>;
}
