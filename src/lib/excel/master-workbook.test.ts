import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readMasterPaste } from "@/lib/excel/master-workbook";

describe("master workbook", () => {
  it("품목 규격은 선택 열이고 단위는 필수 열로 유지한다", () => {
    const rows = readMasterPaste([
      "품목코드\t품목명\t단위",
      "ITEM-0001\t이동형 CCTV\tEA",
    ].join("\n"), "item");

    expect(rows[0].values).toMatchObject({
      품목코드: "ITEM-0001",
      품목명: "이동형 CCTV",
      규격: undefined,
      단위: "EA",
    });

    expect(() => readMasterPaste([
      "품목코드\t품목명\t규격",
      "ITEM-0001\t이동형 CCTV\t200만 화소",
    ].join("\n"), "item")).toThrow("필수 열이 없습니다: 단위");
  });
});
