import type {
  SmartInputPreview,
  SmartInputTarget,
  SmartMasterField,
  SmartMasterOption,
  SmartPeriod,
  SmartValueField,
} from "@/lib/smart-input/types";

type ParseInput = {
  input: string;
  target: SmartInputTarget;
  sites: SmartMasterOption[];
  items: SmartMasterOption[];
  selectedSite?: SmartMasterOption;
  selectedItem?: SmartMasterOption;
  referenceDate?: Date;
};

export function parseSmartInput({ input, target, sites, items, selectedSite, selectedItem, referenceDate = new Date() }: ParseInput): SmartInputPreview {
  const normalizedInput = normalizeText(input);
  const site = selectedSite ? selectedMasterField(selectedSite, "현장") : matchMaster(input, sites, "현장");
  const item = selectedItem ? selectedMasterField(selectedItem, "품목") : matchMaster(input, items, "품목");
  const quantity = parseQuantity(normalizedInput);
  const period = parsePeriod(normalizedInput, referenceDate);
  const explicitUnitPrice = parseMoney(normalizedInput, /(?:a\/?s\s*)?단가\s*([+-]?\d[\d,]*(?:\.\d+)?)\s*(억원|천만원|백만원|만원|천원|원)?/i);
  const explicitTotal = parseMoney(normalizedInput, /(?:총액?|합계|금액)\s*([+-]?\d[\d,]*(?:\.\d+)?)\s*(억원|천만원|백만원|만원|천원|원)?/i);
  const inputUnitPrice = explicitUnitPrice ?? (explicitTotal == null ? parseImplicitUnitPrice(normalizedInput) : null);
  const matchedItem = item.status === "MATCHED" ? item.value : null;
  let unitPrice: SmartValueField<number>;
  if (inputUnitPrice != null) {
    unitPrice = valueField("MATCHED", inputUnitPrice, "문장에서 단가를 찾았습니다.");
  } else if (target === "CONTRACT" && explicitTotal != null && quantity.value) {
    unitPrice = valueField("DERIVED", Math.round(explicitTotal / quantity.value), "총액을 수량으로 나누어 단가를 계산했습니다.");
  } else if (matchedItem?.standardSalesPrice != null) {
    unitPrice = valueField("DERIVED", matchedItem.standardSalesPrice, "품목의 표준 매출단가를 제안합니다.");
  } else {
    unitPrice = valueField("MISSING", null, "단가를 찾지 못했습니다.");
  }

  const calculatedTotal = quantity.value != null && unitPrice.value != null ? Math.round(quantity.value * unitPrice.value) : null;
  const totalAmount = explicitTotal != null
    ? valueField("MATCHED", explicitTotal, "문장에서 총액을 찾았습니다.")
    : calculatedTotal != null
      ? valueField("DERIVED", calculatedTotal, "수량 × 단가로 계산했습니다.")
      : valueField("MISSING", null, "총액을 계산할 정보가 부족합니다.");
  const title = valueField("DERIVED", inferTitle(target, site.value, item.value), "매칭된 마스터로 제목을 제안합니다.");
  const priceOverrideReason = deriveOverrideReason(normalizedInput, inputUnitPrice, explicitTotal, calculatedTotal, matchedItem);
  const warnings = collectWarnings({ target, site, item, quantity, period, unitPrice, totalAmount, explicitTotal, calculatedTotal });
  const canApply = target === "CONTRACT"
    ? site.status === "MATCHED" && item.status === "MATCHED" && quantity.value != null && unitPrice.value != null && period.value != null
    : site.status === "MATCHED" && period.value != null && totalAmount.value != null;
  const confidence = calculateConfidence(target, site, item, quantity, period, unitPrice, totalAmount);

  return {
    target,
    input,
    confidence,
    canApply,
    warnings,
    options: { sites, items },
    fields: {
      site,
      item,
      quantity,
      unitPrice,
      totalAmount,
      period,
      title,
      priceOverrideReason: priceOverrideReason
        ? valueField("DERIVED", priceOverrideReason, "수기 단가 또는 총액의 예외 사유를 제안합니다.")
        : valueField("MISSING", null, "표준 계산과 다를 때 사유를 입력해 주세요."),
    },
  };
}

function selectedMasterField(option: SmartMasterOption, label: string): SmartMasterField {
  return { status: "MATCHED", value: option, candidates: [option], matchedText: null, message: `사용자가 선택한 ${label}을 적용합니다.` };
}

function matchMaster(input: string, options: SmartMasterOption[], label: string): SmartMasterField {
  const inputKey = compact(input);
  const matches = options.flatMap((option) => {
    const terms = [option.name, option.code, ...option.aliases]
      .map((text) => ({ text, key: compact(text) }))
      .filter((term) => term.key.length >= 2 && inputKey.includes(term.key))
      .sort((a, b) => b.key.length - a.key.length);
    return terms[0] ? [{ option, ...terms[0] }] : [];
  }).sort((a, b) => b.key.length - a.key.length);
  const distinct = matches.filter((match, index, all) => {
    if (all.findIndex((candidate) => candidate.option.id === match.option.id) !== index) return false;
    return !all.some((candidate) => candidate.option.id !== match.option.id && candidate.key.length > match.key.length && candidate.key.includes(match.key));
  });
  if (distinct.length === 1) {
    return { status: "MATCHED", value: distinct[0].option, candidates: distinct.map((match) => match.option), matchedText: distinct[0].text, message: label + " 마스터와 일치했습니다." };
  }
  if (distinct.length > 1) {
    return { status: "AMBIGUOUS", value: null, candidates: distinct.map((match) => match.option), matchedText: null, message: label + " 후보가 여러 개입니다. 하나를 선택해 주세요." };
  }
  return { status: "MISSING", value: null, candidates: [], matchedText: null, message: label + "을 찾지 못했습니다. 직접 선택해 주세요." };
}

function parseQuantity(input: string): SmartInputPreview["fields"]["quantity"] {
  const match = input.match(/(?:수량\s*)?(\d+(?:\.\d+)?)\s*(대|개|ea|식|건)(?![a-z가-힣])/i) ?? input.match(/수량\s*(\d+(?:\.\d+)?)(?!\s*(?:만|천)?원)/i);
  if (!match) return { ...valueField("MISSING", null, "수량을 찾지 못했습니다."), unit: null };
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return { ...valueField("MISSING", null, "수량은 0보다 커야 합니다."), unit: null };
  return { ...valueField("MATCHED", value, "문장에서 수량을 찾았습니다."), unit: match[2]?.toUpperCase() ?? null };
}

function parsePeriod(input: string, referenceDate: Date): SmartValueField<SmartPeriod> {
  const referenceYear = referenceDate.getUTCFullYear();
  const shortDayRange = input.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})\s*(?:부터|~)\s*(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (shortDayRange) {
    const startMonth = Number(shortDayRange[1]);
    const startDay = Number(shortDayRange[2]);
    const endMonth = Number(shortDayRange[3]);
    const endDay = Number(shortDayRange[4]);
    const endYear = endMonth < startMonth || (endMonth === startMonth && endDay < startDay) ? referenceYear + 1 : referenceYear;
    const start = dateValue(referenceYear, startMonth, startDay);
    const end = dateValue(endYear, endMonth, endDay);
    if (start && end && start <= end) return valueField("MATCHED", { startDate: start, endDate: end, precision: "DAY" }, "월/일 시작일과 종료일을 찾고 연도를 적용했습니다.");
  }
  const dayRange = input.match(/(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*(?:부터|~)\s*(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*(?:까지)?/);
  if (dayRange) {
    const startYear = resolveYear(dayRange[1], referenceYear);
    const endYear = resolveEndYear(dayRange[4], startYear, Number(dayRange[2]), Number(dayRange[5]));
    const start = dateValue(startYear, Number(dayRange[2]), Number(dayRange[3]));
    const end = dateValue(endYear, Number(dayRange[5]), Number(dayRange[6]));
    if (start && end && start <= end) return valueField("MATCHED", { startDate: start, endDate: end, precision: "DAY" }, "시작일과 종료일을 찾았습니다.");
  }
  const monthRange = input.match(/(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*(?:월\s*)?(?:부터|~)\s*(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*월\s*(?:까지)?/);
  if (monthRange) {
    const startYear = resolveYear(monthRange[1], referenceYear);
    const startMonth = Number(monthRange[2]);
    const endMonth = Number(monthRange[4]);
    const endYear = resolveEndYear(monthRange[3], startYear, startMonth, endMonth);
    const start = dateValue(startYear, startMonth, 1);
    const end = monthEndValue(endYear, endMonth);
    if (start && end && start <= end) return valueField("MATCHED", { startDate: start, endDate: end, precision: "MONTH" }, "월 범위를 찾고 월초·월말로 변환했습니다.");
  }
  const numericRange = input.match(/(\d{2,4})[.-](\d{1,2})\s*(?:부터|~)\s*(?:(\d{2,4})[.-])?(\d{1,2})/);
  if (numericRange) {
    const startYear = resolveYear(numericRange[1], referenceYear);
    const startMonth = Number(numericRange[2]);
    const endMonth = Number(numericRange[4]);
    const endYear = resolveEndYear(numericRange[3], startYear, startMonth, endMonth);
    const start = dateValue(startYear, startMonth, 1);
    const end = monthEndValue(endYear, endMonth);
    if (start && end && start <= end) return valueField("MATCHED", { startDate: start, endDate: end, precision: "MONTH" }, "숫자 월 범위를 찾았습니다.");
  }
  const isoDay = input.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  const koreanDay = input.match(/(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (isoDay || koreanDay) {
    const match = isoDay ?? koreanDay!;
    const value = dateValue(resolveYear(match[1], referenceYear), Number(match[2]), Number(match[3]));
    if (value) return valueField("MATCHED", { startDate: value, endDate: value, precision: "DAY" }, "매출일을 찾았습니다.");
  }
  const shortDay = input.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (shortDay) {
    const value = dateValue(referenceYear, Number(shortDay[1]), Number(shortDay[2]));
    if (value) return valueField("MATCHED", { startDate: value, endDate: value, precision: "DAY" }, "월/일을 찾고 현재 연도를 적용했습니다.");
  }
  const isoMonth = input.match(/\b(\d{4})-(\d{1,2})\b/);
  const koreanMonth = input.match(/(?:(\d{2,4})\s*년\s*)?(\d{1,2})\s*월/);
  const dottedMonth = input.match(/\b(\d{2,4})\.(\d{1,2})\b/);
  const month = isoMonth ?? koreanMonth ?? dottedMonth;
  if (month) {
    const year = resolveYear(month[1], referenceYear);
    const monthNumber = Number(month[2]);
    const start = dateValue(year, monthNumber, 1);
    const end = monthEndValue(year, monthNumber);
    if (start && end) return valueField("MATCHED", { startDate: start, endDate: end, precision: "MONTH" }, "월을 찾고 월초·월말로 변환했습니다.");
  }
  return valueField("MISSING", null, "날짜 또는 기간을 찾지 못했습니다.");
}

function parseMoney(input: string, pattern: RegExp) {
  const match = input.match(pattern);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  const multiplier = ({ 억원: 100_000_000, 천만원: 10_000_000, 백만원: 1_000_000, 만원: 10_000, 천원: 1_000, 원: 1 } as Record<string, number>)[match[2] ?? "원"] ?? 1;
  const value = Math.round(amount * multiplier);
  return Number.isFinite(value) ? value : null;
}

function parseImplicitUnitPrice(input: string) {
  const currencyAfterNamedQuantity = parseMoney(
    input,
    /수량\s*\d+(?:\.\d+)?[\s,]*(?!총액?|합계|금액|단가)([+-]?\d[\d,]*(?:\.\d+)?)\s*(억원|천만원|백만원|만원|천원|원)(?![a-z가-힣])/i,
  );
  if (currencyAfterNamedQuantity != null) return currencyAfterNamedQuantity;
  const currencyAfterQuantity = parseMoney(
    input,
    /(?:\d+(?:\.\d+)?)\s*(?:대|개|ea|식|건)(?![a-z가-힣])[\s,]*(?!총액?|합계|금액|단가)([+-]?\d[\d,]*(?:\.\d+)?)\s*(억원|천만원|백만원|만원|천원|원)(?![a-z가-힣])/i,
  );
  if (currencyAfterQuantity != null) return currencyAfterQuantity;
  const bareAfterQuantity = parseMoney(
    input,
    /(?:\d+(?:\.\d+)?)\s*(?:대|개|ea|식|건)(?![a-z가-힣])[\s,]*(?!총액?|합계|금액|단가)([+-]?\d[\d,]*)(?![\d./a-z가-힣~-])/i,
  );
  return bareAfterQuantity;
}

function deriveOverrideReason(input: string, inputUnitPrice: number | null, explicitTotal: number | null, calculatedTotal: number | null, item: SmartMasterOption | null) {
  const asPrice = /a\/?s|에이에스/i.test(input);
  if (inputUnitPrice != null && item?.standardSalesPrice != null && inputUnitPrice !== item.standardSalesPrice) return asPrice ? "A/S 단가" : "문장 입력 단가";
  if (explicitTotal != null && calculatedTotal != null && explicitTotal !== calculatedTotal) return asPrice ? "A/S 총액" : "문장 입력 총액";
  return "";
}

function collectWarnings({ target, site, item, quantity, period, unitPrice, totalAmount, explicitTotal, calculatedTotal }: {
  target: SmartInputTarget;
  site: SmartMasterField;
  item: SmartMasterField;
  quantity: SmartValueField<number>;
  period: SmartValueField<SmartPeriod>;
  unitPrice: SmartValueField<number>;
  totalAmount: SmartValueField<number>;
  explicitTotal: number | null;
  calculatedTotal: number | null;
}) {
  const warnings: string[] = [];
  const fields: Array<[string, { status: string; message: string }]> = [["현장", site], ["품목", item], ["수량", quantity], ["기간", period], ["단가", unitPrice], ["총액", totalAmount]];
  for (const [label, field] of fields) {
    if (field.status === "AMBIGUOUS" || field.status === "MISSING") warnings.push(label + ": " + field.message);
  }
  if (target === "REVENUE" && period.value?.startDate !== period.value?.endDate) warnings.push("자유형 매출 폼에는 분석 기간의 시작일을 매출일로 적용합니다.");
  if (target === "REVENUE" && item.status === "MISSING" && totalAmount.value != null) warnings.push("품목 없이 자유형 매출로 적용할 수 있습니다.");
  if (explicitTotal != null && calculatedTotal != null && explicitTotal !== calculatedTotal) warnings.push("문장의 총액이 수량 × 단가와 다릅니다. 예외 사유를 확인해 주세요.");
  return [...new Set(warnings)];
}

function calculateConfidence(target: SmartInputTarget, site: SmartMasterField, item: SmartMasterField, quantity: SmartValueField<number>, period: SmartValueField<SmartPeriod>, unitPrice: SmartValueField<number>, totalAmount: SmartValueField<number>) {
  const score = fieldScore(site) * 0.25 + fieldScore(period) * 0.2 + fieldScore(totalAmount) * 0.15 + fieldScore(unitPrice) * 0.15 + fieldScore(quantity) * 0.1 + fieldScore(item) * 0.15;
  const adjusted = target === "REVENUE" && item.status === "MISSING" && totalAmount.value != null ? score + 0.08 : score;
  return Math.min(100, Math.round(adjusted * 100));
}

function fieldScore(field: { status: string }) {
  return field.status === "MATCHED" ? 1 : field.status === "DERIVED" ? 0.75 : field.status === "AMBIGUOUS" ? 0.25 : 0;
}
function valueField(status: SmartValueField<never>["status"], value: null, message: string): SmartValueField<never>;
function valueField<T>(status: SmartValueField<T>["status"], value: T, message: string): SmartValueField<T>;
function valueField<T>(status: SmartValueField<T>["status"], value: T | null, message: string): SmartValueField<T> { return { status, value, message }; }
function inferTitle(target: SmartInputTarget, site: SmartMasterOption | null, item: SmartMasterOption | null) { return ((site?.name ?? "현장") + " " + (item?.name ?? (target === "CONTRACT" ? "계약" : "매출"))).slice(0, 100); }
function normalizeText(value: string) { return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/₩/g, "원").replace(/\s+/g, " ").trim(); }
function compact(value: string) { return normalizeText(value).replace(/[^0-9a-z가-힣]/g, ""); }
function resolveYear(value: string | undefined, fallback: number) { if (!value) return fallback; const year = Number(value); return year < 100 ? 2000 + year : year; }
function resolveEndYear(value: string | undefined, startYear: number, startMonth: number, endMonth: number) { return value ? resolveYear(value, startYear) : endMonth < startMonth ? startYear + 1 : startYear; }
function dateValue(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}
function monthEndValue(year: number, month: number) { return dateValue(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()); }
