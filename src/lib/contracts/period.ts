export type ContractPeriodLine = {
  revenueStartDate: string | Date;
  revenueEndDate: string | Date;
};

export function deriveContractPeriod(lines: ContractPeriodLine[]) {
  if (lines.length === 0) throw new Error("계약 품목을 한 개 이상 입력해 주세요.");

  const periods = lines.map((line) => ({
    startDate: dateOnly(line.revenueStartDate),
    endDate: dateOnly(line.revenueEndDate),
  }));
  return {
    startDate: periods.reduce((earliest, line) => line.startDate < earliest ? line.startDate : earliest, periods[0].startDate),
    endDate: periods.reduce((latest, line) => line.endDate > latest ? line.endDate : latest, periods[0].endDate),
  };
}

export function enumerateMonths(startDate: string | Date, endDate: string | Date) {
  const result: string[] = [];
  const start = new Date(`${dateOnly(startDate).slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${dateOnly(endDate).slice(0, 7)}-01T00:00:00.000Z`);
  for (const cursor = start; cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) result.push(cursor.toISOString().slice(0, 7));
  return result;
}

export function spansMoreThanTwoCalendarMonths(startDate: string, endDate: string) {
  if (!startDate || !endDate) return false;
  return enumerateMonths(startDate, endDate).length > 2;
}

export function monthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("대상월 형식이 올바르지 않습니다.");

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error("대상월 형식이 올바르지 않습니다.");

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    min: `${month}-01`,
    max: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function dateOnly(value: string | Date) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.length === 7 ? `${value}-01` : value;
}
