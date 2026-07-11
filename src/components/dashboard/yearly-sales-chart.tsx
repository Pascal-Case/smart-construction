type ChartMonth = { month: string; label: string; salesAmount: number; profit: number };

const width = 960;
const height = 320;
const margin = { top: 24, right: 24, bottom: 44, left: 80 };

function compactWon(value: number) {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(value % 100_000_000 === 0 ? 0 : 1)}억`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(value % 10_000 === 0 ? 0 : 1)}만`;
  return value.toLocaleString("ko-KR");
}

export function YearlySalesChart({ year, months }: { year: number; months: ChartMonth[] }) {
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const minValue = Math.min(0, ...months.flatMap((month) => [month.salesAmount, month.profit]));
  let maxValue = Math.max(0, ...months.flatMap((month) => [month.salesAmount, month.profit]));
  if (minValue === maxValue) maxValue = minValue + 1;
  const valueRange = maxValue - minValue;
  const x = (index: number) => margin.left + (plotWidth * index) / Math.max(months.length - 1, 1);
  const y = (value: number) => margin.top + ((maxValue - value) / valueRange) * plotHeight;
  const salesPoints = months.map((month, index) => `${x(index)},${y(month.salesAmount)}`).join(" ");
  const profitPoints = months.map((month, index) => `${x(index)},${y(month.profit)}`).join(" ");
  const gridValues = Array.from({ length: 5 }, (_, index) => maxValue - (valueRange * index) / 4);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="yearly-chart-title yearly-chart-description" className="h-auto min-w-[720px] w-full">
        <title id="yearly-chart-title">{year}년 월간 매출 및 매출이익</title>
        <desc id="yearly-chart-description">1월부터 12월까지 월별 매출과 매출이익을 비교한 선 그래프입니다.</desc>
        {gridValues.map((value) => (
          <g key={value}>
            <line x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} className="stroke-border" strokeDasharray="4 6" />
            <text x={margin.left - 12} y={y(value) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{compactWon(Math.round(value))}원</text>
          </g>
        ))}
        {months.map((month, index) => (
          <text key={month.month} x={x(index)} y={height - 16} textAnchor="middle" className="fill-muted-foreground text-[11px]">{month.label}</text>
        ))}
        <polyline points={salesPoints} fill="none" stroke="#0d9488" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={profitPoints} fill="none" stroke="#f59e0b" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        {months.map((month, index) => (
          <g key={`points-${month.month}`}>
            <circle cx={x(index)} cy={y(month.salesAmount)} r="5" fill="#0d9488"><title>{month.label} 매출 {month.salesAmount.toLocaleString("ko-KR")}원</title></circle>
            <circle cx={x(index)} cy={y(month.profit)} r="5" fill="#f59e0b"><title>{month.label} 매출이익 {month.profit.toLocaleString("ko-KR")}원</title></circle>
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-teal-600" />월간 매출</span>
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-amber-500" />매출이익</span>
      </div>
      <ul className="sr-only">
        {months.map((month) => <li key={`summary-${month.month}`}>{month.label}: 매출 {month.salesAmount.toLocaleString("ko-KR")}원, 매출이익 {month.profit.toLocaleString("ko-KR")}원</li>)}
      </ul>
    </div>
  );
}
