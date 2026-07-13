"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { TableHead } from "@/components/ui/table";
import type { SortDirection } from "@/lib/list-sorting";
import { cn } from "@/lib/utils";

type SortableTableHeadProps = {
  children: ReactNode;
  direction?: SortDirection;
  isDefault?: boolean;
  numeric?: boolean;
  onSort: () => void;
  className?: string;
};

export function SortableTableHead({
  children,
  direction,
  isDefault = false,
  numeric = false,
  onSort,
  className,
}: SortableTableHeadProps) {
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
  const ariaSort = direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none";

  return (
    <TableHead aria-sort={ariaSort} className={cn(numeric && "text-right", className)}>
      <button
        type="button"
        className={cn(
          "group -mx-2 inline-flex h-10 items-center gap-1 rounded-md px-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          numeric && "ml-auto text-right",
        )}
        onClick={onSort}
        title="클릭하여 정렬 순서 변경"
      >
        <span>{children}</span>
        <Icon aria-hidden className={cn("size-3.5", direction ? "text-teal-700" : "text-muted-foreground/70")} />
        {isDefault && <span className="sr-only">기본 정렬</span>}
      </button>
    </TableHead>
  );
}
