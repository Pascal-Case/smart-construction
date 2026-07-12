import { MonthCloseControlRoom } from "@/components/reports/month-close-control-room";
import { getCurrentUser } from "@/lib/auth/session";

export default async function MonthCloseControlRoomPage() {
  const user = await getCurrentUser();
  const canClose = user?.role === "ADMIN" || user?.role === "MANAGER";
  return <div className="mx-auto max-w-[1600px] space-y-6">
    <div><p className="text-sm font-semibold text-teal-700">월별 집계</p><h1 className="text-2xl font-semibold">월마감 관제실</h1><p className="mt-1 text-sm text-muted-foreground">계약·단가 차이와 직접 입력, 발행 후 변경을 인지하고 현장별로 마감·되돌리기·재마감합니다.</p></div>
    <MonthCloseControlRoom canClose={canClose} isAdmin={user?.role === "ADMIN"} />
  </div>;
}
