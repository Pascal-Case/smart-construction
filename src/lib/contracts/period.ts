export type ContractPeriodLine = {
  revenueStartDate: string;
  revenueEndDate: string;
};

export function deriveContractPeriod(lines: ContractPeriodLine[]) {
  if (lines.length === 0) throw new Error("계약 품목을 한 개 이상 입력해 주세요.");

  return {
    startDate: lines.reduce((earliest, line) => line.revenueStartDate < earliest ? line.revenueStartDate : earliest, lines[0].revenueStartDate),
    endDate: lines.reduce((latest, line) => line.revenueEndDate > latest ? line.revenueEndDate : latest, lines[0].revenueEndDate),
  };
}
