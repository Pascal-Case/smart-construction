const FORMULA_PREFIX = /^\s*[=+\-@]/;

export function safeExcelValue(value: unknown): string | number | boolean | Date | null {
  if (typeof value === "string" && FORMULA_PREFIX.test(value)) return `'${value}`;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  if (value == null) return null;
  return String(value);
}
