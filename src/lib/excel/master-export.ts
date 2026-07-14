import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createMasterWorkbook, type MasterRow } from "@/lib/excel/master-workbook";

const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function exportSiteWorkbook(template: boolean) {
  const sites = template ? [] : await prisma.site.findMany({
    include: { aliases: { orderBy: { alias: "asc" } } },
    orderBy: { name: "asc" },
  });
  const rows: MasterRow[] = sites.map((site) => ({
    현장코드: site.code,
    현장명: site.name,
    거래처: site.customerName,
    주소: site.address,
    담당자: site.managerName,
    연락처: site.managerContact,
    시작일: formatDate(site.startDate),
    종료일: formatDate(site.endDate),
    사용여부: site.isActive ? "Y" : "N",
    메모: site.memo,
    별칭: site.aliases.map((alias) => alias.alias).join("|"),
  }));
  return workbookResponse(await createMasterWorkbook("site", rows, template), template ? "현장마스터_양식.xlsx" : "현장마스터.xlsx");
}

export async function exportItemWorkbook(template: boolean) {
  const items = template ? [] : await prisma.item.findMany({
    include: { aliases: { orderBy: { alias: "asc" } } },
    orderBy: { name: "asc" },
  });
  const rows: MasterRow[] = items.map((item) => ({
    품목코드: item.code,
    품목명: item.name,
    규격: item.specification,
    단위: item.unit,
    표준매출단가: item.standardSalesPrice,
    표준매입단가: item.standardCostPrice,
    사용여부: item.isActive ? "Y" : "N",
    메모: item.memo,
    별칭: item.aliases.map((alias) => alias.alias).join("|"),
  }));
  return workbookResponse(await createMasterWorkbook("item", rows, template), template ? "품목마스터_양식.xlsx" : "품목마스터.xlsx");
}

function workbookResponse(buffer: ArrayBuffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

function formatDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? "";
}
