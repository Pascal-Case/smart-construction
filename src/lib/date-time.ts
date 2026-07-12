const seoulDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatSeoulDateTime(value: string | Date | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = new Map(seoulDateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const dayPeriod = parts.get("dayPeriod")?.toUpperCase();
  const hour = parts.get("hour");
  const minute = parts.get("minute");
  const second = parts.get("second");
  if (![year, month, day, dayPeriod, hour, minute, second].every(Boolean)) return "-";
  return `${year}. ${month}. ${day}. ${dayPeriod} ${hour}:${minute}:${second}`;
}
