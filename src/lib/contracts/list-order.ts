export type ContractAmountLine = { quantity: number; appliedSalesPrice: number };

export function contractBaseAmount(lines: ContractAmountLine[]) {
  return lines.reduce((sum, line) => sum + Math.round(line.quantity * line.appliedSalesPrice), 0);
}
