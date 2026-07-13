import { MasterManager, type ItemView, type MasterList } from "@/components/masters/master-manager";
import { getCurrentUser } from "@/lib/auth/session";
import { parseExplicitSort } from "@/lib/list-sorting";
import { itemListQuerySchema, itemSortKeys } from "@/lib/masters/schemas";
import { listItems } from "@/lib/masters/item-service";

export default async function ItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  const rawQuery = await searchParams;
  const parsedQuery = itemListQuerySchema.safeParse(rawQuery);
  const query = parsedQuery.success ? parsedQuery.data : itemListQuerySchema.parse({});
  const params = new URLSearchParams(Object.entries(rawQuery).flatMap(([key, value]) => typeof value === "string" ? [[key, value]] : []));
  const initialSort = parseExplicitSort(params, itemSortKeys);
  const result = await listItems(query);
  const initialData: MasterList<ItemView> = { ...result, rows: result.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })) };
  return <div className="mx-auto max-w-[1400px] space-y-6"><div><p className="text-sm font-semibold text-teal-700">기초 데이터</p><h1 className="text-2xl font-semibold">품목 마스터</h1><p className="mt-1 text-sm text-muted-foreground">표준 단가와 단위, 업무에서 사용하는 품목 별칭을 관리합니다.</p></div><MasterManager type="item" initialData={initialData} initialQuery={query} initialSort={initialSort} canEdit={user?.role === "ADMIN" || user?.role === "MANAGER"} /></div>;
}
