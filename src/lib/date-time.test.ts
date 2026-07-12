import { describe, expect, it } from "vitest";

import { formatSeoulDateTime } from "@/lib/date-time";

describe("formatSeoulDateTime", () => {
  it("서울 시간의 AM/PM 형식을 정확히 조합한다", () => {
    expect(formatSeoulDateTime("2026-07-12T12:38:43.000Z")).toBe("2026. 7. 12. PM 9:38:43");
  });

  it("자정과 정오를 12시로 표시한다", () => {
    expect(formatSeoulDateTime("2026-07-11T15:00:00.000Z")).toBe("2026. 7. 12. AM 12:00:00");
    expect(formatSeoulDateTime("2026-07-12T03:00:00.000Z")).toBe("2026. 7. 12. PM 12:00:00");
  });

  it("비어 있거나 잘못된 값은 대시로 표시한다", () => {
    expect(formatSeoulDateTime(null)).toBe("-");
    expect(formatSeoulDateTime("invalid")).toBe("-");
  });
});
