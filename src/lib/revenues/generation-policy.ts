export const AUTO_CANCEL_REASON = "계약 변경으로 자동 매출 생성 대상에서 제외";

export function contractRevenuePolicy(row: { status: string; cancelReason: string | null }) {
  if (row.status === "CONFIRMED") return "PROTECTED" as const;
  if (row.status === "CANCELED" && row.cancelReason !== AUTO_CANCEL_REASON) return "RECREATE" as const;
  return "MUTABLE" as const;
}

export function generatedKeyAfterUserCancel(sourceType: string, generatedKey: string | null) {
  return sourceType === "CONTRACT" ? null : generatedKey;
}
