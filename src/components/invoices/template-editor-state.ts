import type { InvoiceBlockKey, InvoiceColumnKey, InvoiceTemplateConfig, InvoiceTemplateStyle } from "@/lib/invoice-templates/config";
import { INVOICE_GRID_COLUMNS, INVOICE_GRID_ROWS } from "@/lib/invoice-templates/config";

export function moveInvoiceBlock(config: InvoiceTemplateConfig, key: InvoiceBlockKey, deltaX: number, deltaY: number) {
  const next = structuredClone(config);
  const block = next.blocks[key];
  block.x = clamp(block.x + deltaX, 0, INVOICE_GRID_COLUMNS - block.width);
  block.y = clamp(block.y + deltaY, 0, INVOICE_GRID_ROWS - block.height);
  return overlapsAnotherBlock(next, key) ? structuredClone(config) : next;
}

export function resizeInvoiceBlock(config: InvoiceTemplateConfig, key: InvoiceBlockKey, deltaWidth: number, deltaHeight: number) {
  const next = structuredClone(config);
  const block = next.blocks[key];
  block.width = clamp(block.width + deltaWidth, 1, INVOICE_GRID_COLUMNS - block.x);
  block.height = clamp(block.height + deltaHeight, 1, INVOICE_GRID_ROWS - block.y);
  return overlapsAnotherBlock(next, key) ? structuredClone(config) : next;
}

export function updateInvoiceBlockStyle(config: InvoiceTemplateConfig, key: InvoiceBlockKey, patch: Partial<InvoiceTemplateStyle>) {
  const next = structuredClone(config);
  next.blocks[key].style = { ...next.blocks[key].style, ...patch };
  return next;
}

export function moveInvoiceColumn(config: InvoiceTemplateConfig, key: InvoiceColumnKey, direction: -1 | 1) {
  const next = structuredClone(config);
  const index = next.columns.findIndex((column) => column.key === key);
  const target = clamp(index + direction, 0, next.columns.length - 1);
  if (index !== target) [next.columns[index], next.columns[target]] = [next.columns[target], next.columns[index]];
  return next;
}

export function updateInvoiceColumn(config: InvoiceTemplateConfig, key: InvoiceColumnKey, patch: Partial<InvoiceTemplateConfig["columns"][number]>) {
  const next = structuredClone(config);
  const index = next.columns.findIndex((column) => column.key === key);
  next.columns[index] = { ...next.columns[index], ...patch, key };
  return next;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function overlapsAnotherBlock(config: InvoiceTemplateConfig, key: InvoiceBlockKey) {
  const block = config.blocks[key];
  return Object.entries(config.blocks).some(([otherKey, other]) => otherKey !== key
    && block.x < other.x + other.width
    && block.x + block.width > other.x
    && block.y < other.y + other.height
    && block.y + block.height > other.y);
}
