import type { SortDirection } from "@/lib/list-sorting";
import { compareNullable } from "@/lib/list-sorting";
import type { ItemSortKey, SiteSortKey } from "@/lib/masters/schemas";

type Alias = string | { alias: string };
type BaseRow = {
  id: string;
  code?: string;
  name?: string;
  aliases: Alias[];
  isActive: boolean;
  updatedAt?: Date | string;
};
type SiteRow = BaseRow & {
  customerName?: string | null;
  managerName?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
};
type ItemRow = BaseRow & {
  unit?: string;
  standardSalesPrice?: number;
  standardCostPrice?: number;
};

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function alias(row: BaseRow) {
  const first = row.aliases[0];
  return text(typeof first === "string" ? first : first?.alias);
}

function dateValue(value: Date | string | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function compareText(left: string, right: string) {
  return collator.compare(left, right);
}

function compareNumber(left: number, right: number) {
  return left - right;
}

function stabilize<T extends { id: string }>(rows: T[], compare: (left: T, right: T) => number) {
  return [...rows].sort((left, right) => compare(left, right) || left.id.localeCompare(right.id));
}

export function sortSites<T extends SiteRow>(rows: T[], key: SiteSortKey, direction: SortDirection) {
  return stabilize(rows, (left, right) => {
    if (key === "period") {
      return compareNullable(dateValue(left.startDate), dateValue(right.startDate), compareNumber, direction)
        || compareNullable(dateValue(left.endDate), dateValue(right.endDate), compareNumber, direction);
    }
    if (key === "alias") return compareNullable(alias(left), alias(right), compareText, direction);
    if (key === "status") return (left.isActive === right.isActive ? 0 : left.isActive ? -1 : 1) * (direction === "asc" ? 1 : -1);
    if (key === "updatedAt") return compareNullable(dateValue(left.updatedAt), dateValue(right.updatedAt), compareNumber, direction);
    return compareNullable(text(left[key]), text(right[key]), compareText, direction);
  });
}

export function sortItems<T extends ItemRow>(rows: T[], key: ItemSortKey, direction: SortDirection) {
  return stabilize(rows, (left, right) => {
    if (key === "alias") return compareNullable(alias(left), alias(right), compareText, direction);
    if (key === "status") return (left.isActive === right.isActive ? 0 : left.isActive ? -1 : 1) * (direction === "asc" ? 1 : -1);
    if (key === "updatedAt") return compareNullable(dateValue(left.updatedAt), dateValue(right.updatedAt), compareNumber, direction);
    if (key === "standardSalesPrice" || key === "standardCostPrice") {
      return compareNullable(left[key], right[key], compareNumber, direction);
    }
    return compareNullable(text(left[key]), text(right[key]), compareText, direction);
  });
}
