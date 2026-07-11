export function revenueMonthBounds(month: string) {
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
