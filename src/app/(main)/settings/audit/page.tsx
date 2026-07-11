import { redirect } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditPagination } from "@/lib/audit/pagination";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.role !== "ADMIN") redirect("/");
  const query = await searchParams;
  const rawPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const total = await prisma.auditLog.count();
  const pagination = auditPagination(rawPage, total);
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.pageSize });
  const href = (page: number) => `/settings/audit?page=${page}`;

  return <div className="mx-auto max-w-6xl space-y-6"><div><p className="text-sm font-semibold text-teal-700">설정</p><h1 className="text-2xl font-semibold">감사 로그</h1><p className="mt-1 text-sm text-muted-foreground">전체 감사 기록을 최신순으로 확인합니다.</p></div><div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>일시</TableHead><TableHead>사용자</TableHead><TableHead>작업</TableHead><TableHead>대상</TableHead><TableHead>대상 ID</TableHead></TableRow></TableHeader><TableBody>{logs.length ? logs.map((log) => <TableRow key={log.id}><TableCell className="whitespace-nowrap">{log.createdAt.toLocaleString("ko-KR")}</TableCell><TableCell>{log.actorName ?? "시스템"}</TableCell><TableCell><Badge variant="outline">{log.action}</Badge></TableCell><TableCell>{log.entityType}</TableCell><TableCell className="max-w-52 truncate font-mono text-xs">{log.entityId ?? "-"}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">감사 로그가 없습니다.</TableCell></TableRow>}</TableBody></Table></div><div className="flex items-center justify-between text-sm text-muted-foreground"><span>총 {total.toLocaleString()}건 · {pagination.page}/{pagination.totalPages} 페이지</span><div className="flex gap-2">{pagination.page > 1 ? <Button size="sm" variant="outline" render={<Link href={href(pagination.page - 1)} />}>이전</Button> : <Button size="sm" variant="outline" disabled>이전</Button>}{pagination.page < pagination.totalPages ? <Button size="sm" variant="outline" render={<Link href={href(pagination.page + 1)} />}>다음</Button> : <Button size="sm" variant="outline" disabled>다음</Button>}</div></div></div>;
}
