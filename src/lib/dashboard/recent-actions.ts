type RecentAuditLog = {
  actorName: string | null;
  action: string;
  entityType: string;
  afterJson: string | null;
};

const entityDetails: Record<string, { key: string; label: string }> = {
  SITE: { key: "name", label: "현장" },
  ITEM: { key: "name", label: "품목" },
  CONTRACT: { key: "title", label: "계약" },
  REVENUE: { key: "title", label: "매출" },
  INVOICE: { key: "invoiceNo", label: "거래명세표" },
  MONTHLY_MEMO: { key: "month", label: "월별 메모" },
  USER: { key: "name", label: "사용자" },
};

const actionVerbs: Record<string, string> = {
  CREATE: "등록하였습니다",
  UPDATE: "수정하였습니다",
  CONFIRM: "확정하였습니다",
  CANCEL: "취소하였습니다",
  ISSUE: "발행하였습니다",
  GENERATE: "생성하였습니다",
  IMPORT: "가져왔습니다",
  MIGRATE: "이관하였습니다",
};

export function formatRecentAction(log: RecentAuditLog) {
  const actor = log.actorName ? `${log.actorName} 님이` : "시스템이";
  const detail = entityDetails[log.entityType];
  const data = parseObject(log.afterJson);
  const candidateName = detail ? data?.[detail.key] : null;
  const rawName = typeof candidateName === "string" ? candidateName : null;
  const target = rawName && detail ? `${rawName}${rawName.endsWith(detail.label) ? "" : ` ${detail.label}`}` : "업무 데이터";
  const verb = actionVerbs[log.action] ?? "변경하였습니다";

  return `${actor} ${target}${objectParticle(target)} ${verb}.`;
}

function parseObject(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function objectParticle(value: string) {
  const last = value.at(-1);
  if (!last) return "을";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "을";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}
