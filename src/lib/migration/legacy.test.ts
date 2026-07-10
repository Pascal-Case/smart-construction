import { describe, expect, it } from "vitest";

import { fingerprintLegacyBundle, legacyContractNo, parseLegacyPayload } from "@/lib/migration/legacy";

const validPayload = {
  format: "smart-construction-legacy-v1",
  exportedAt: "2026-07-10T00:00:00.000Z",
  items: [{ id: "1", name: "이동형 CCTV", salesPrice: 220000, costPrice: 120000, unit: "대/월" }],
  contracts: [{ id: "10", site: "송도 A현장", itemId: "1", qty: 2, startDate: "2026-05-01", endDate: "2026-12-31" }],
  supplier: { regNo: "101-81-30747", name: "테스트 공급자", owner: "김정수", address: "서울", type: "도소매", category: "통신판매" },
};

describe("legacy migration parser", () => {
  it("레거시 export bundle을 정규화한다", () => {
    const result = parseLegacyPayload(validPayload, "legacy.json");
    expect(result.issues).toEqual([]);
    expect(result.bundle.items[0]).toMatchObject({ id: "1", salesPrice: 220000 });
    expect(result.bundle.contracts[0]).toMatchObject({ id: "10", quantity: 2 });
    expect(result.bundle.supplier).toMatchObject({ companyName: "테스트 공급자", phone: "미입력" });
    expect(result.bundle.sourceName).toBe("legacy.json");
  });

  it("localStorage key와 JSON 문자열을 직접 받을 수 있다", () => {
    const result = parseLegacyPayload({
      exportedAt: "2026-07-10T00:00:00.000Z",
      scs_master_items_v15_local: JSON.stringify(validPayload.items),
      scs_master_contracts_v15_local: JSON.stringify(validPayload.contracts),
      scs_master_supplier_v15_local: JSON.stringify(validPayload.supplier),
    });
    expect(result.issues).toEqual([]);
    expect(result.bundle.items).toHaveLength(1);
    expect(result.bundle.contracts).toHaveLength(1);
  });

  it("누락 품목 참조와 잘못된 날짜를 행 오류로 보고한다", () => {
    const result = parseLegacyPayload({
      items: validPayload.items,
      contracts: [
        { id: "bad-date", site: "현장", itemId: "1", qty: 1, startDate: "2026-13-01", endDate: "2026-12-01" },
        { id: "missing-item", site: "현장", itemId: "999", qty: 1, startDate: "2026-01-01", endDate: "2026-12-01" },
      ],
    });
    expect(result.issues.some((issue) => issue.rowKey === "1" && issue.kind === "CONTRACT")).toBe(true);
    expect(result.issues.some((issue) => issue.rowKey === "missing-item" && issue.message.includes("999"))).toBe(true);
  });

  it("같은 bundle fingerprint와 계약번호가 결정적으로 유지된다", () => {
    const first = parseLegacyPayload(validPayload).bundle;
    const second = parseLegacyPayload(validPayload).bundle;
    expect(fingerprintLegacyBundle(first)).toBe(fingerprintLegacyBundle(second));
    expect(fingerprintLegacyBundle(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(legacyContractNo("10")).toBe(legacyContractNo("10"));
    expect(legacyContractNo("10")).not.toBe(legacyContractNo("11"));
  });

  it("preview가 반환한 정규화 bundle을 commit 입력으로 다시 읽는다", () => {
    const first = parseLegacyPayload(validPayload).bundle;
    const second = parseLegacyPayload(first).bundle;
    expect(second).toEqual(first);
    expect(fingerprintLegacyBundle(second)).toBe(fingerprintLegacyBundle(first));
  });
});
