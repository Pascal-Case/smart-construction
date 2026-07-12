import { z } from "zod";

import {
  calculateInvoiceRowHeightMm,
  cloneDefaultInvoiceTemplateConfig,
  INVOICE_BLOCK_KEYS,
  INVOICE_COLUMN_KEYS,
  INVOICE_FONT_FAMILIES,
  INVOICE_GRID_COLUMNS,
  INVOICE_GRID_ROWS,
  INVOICE_PAGE_CONTENT_HEIGHT_MM,
  INVOICE_TEMPLATE_SCHEMA_VERSION,
  normalizeTemplateName,
} from "@/lib/invoice-templates/config";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "색상은 #RRGGBB 형식이어야 합니다.");
const styleSchema = z.object({
  fontFamily: z.enum(INVOICE_FONT_FAMILIES),
  fontSizePt: z.number().min(6).max(32),
  fontWeight: z.union([z.literal(400), z.literal(600), z.literal(700)]),
  textColor: hexColor,
  backgroundColor: hexColor,
  borderColor: hexColor,
});
const blockSchema = z.object({
  x: z.number().int().min(0).max(INVOICE_GRID_COLUMNS - 1),
  y: z.number().int().min(0).max(INVOICE_GRID_ROWS - 1),
  width: z.number().int().min(1).max(INVOICE_GRID_COLUMNS),
  height: z.number().int().min(1).max(INVOICE_GRID_ROWS),
  style: styleSchema,
});
const columnSchema = z.object({
  key: z.enum(INVOICE_COLUMN_KEYS),
  width: z.number().int().min(5).max(60),
  visible: z.boolean(),
});

export const invoiceTemplateConfigSchema = z.object({
  schemaVersion: z.literal(INVOICE_TEMPLATE_SCHEMA_VERSION),
  blocks: z.object({
    title: blockSchema,
    recipient: blockSchema,
    supplier: blockSchema,
    table: blockSchema,
    total: blockSchema,
    memo: blockSchema,
  }),
  columns: z.array(columnSchema).length(INVOICE_COLUMN_KEYS.length),
}).superRefine((config, context) => {
  const rectangles = INVOICE_BLOCK_KEYS.map((key) => ({ key, ...config.blocks[key] }));
  for (const rectangle of rectangles) {
    if (rectangle.x + rectangle.width > INVOICE_GRID_COLUMNS || rectangle.y + rectangle.height > INVOICE_GRID_ROWS) {
      context.addIssue({ code: "custom", path: ["blocks", rectangle.key], message: "블록이 A4 격자를 벗어납니다." });
    }
  }
  for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rectangles.length; rightIndex += 1) {
      const left = rectangles[leftIndex];
      const right = rectangles[rightIndex];
      const overlaps = left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
      if (overlaps) context.addIssue({ code: "custom", path: ["blocks", right.key], message: `${left.key} 블록과 겹칩니다.` });
    }
  }
  const keys = config.columns.map((column) => column.key);
  if (new Set(keys).size !== INVOICE_COLUMN_KEYS.length || INVOICE_COLUMN_KEYS.some((key) => !keys.includes(key))) {
    context.addIssue({ code: "custom", path: ["columns"], message: "모든 열을 중복 없이 포함해야 합니다." });
  }
  if (config.columns.reduce((sum, column) => sum + column.width, 0) !== 100) {
    context.addIssue({ code: "custom", path: ["columns"], message: "열 너비 합계는 100이어야 합니다." });
  }
  for (const requiredKey of ["itemName", "supplyAmount"] as const) {
    if (!config.columns.find((column) => column.key === requiredKey)?.visible) {
      context.addIssue({ code: "custom", path: ["columns"], message: "품명과 금액 열은 숨길 수 없습니다." });
    }
  }
  const tableHeightMm = (config.blocks.table.height / INVOICE_GRID_ROWS) * INVOICE_PAGE_CONTENT_HEIGHT_MM;
  if (tableHeightMm < 8 + calculateInvoiceRowHeightMm(config)) {
    context.addIssue({ code: "custom", path: ["blocks", "table", "height"], message: "품목표는 헤더와 최소 1개 행이 들어갈 높이가 필요합니다." });
  }
});

const templateName = z.string().trim().min(1, "템플릿 이름을 입력해 주세요.").max(80);

export const invoiceTemplateCreateSchema = z.object({ name: templateName, config: invoiceTemplateConfigSchema });
export const invoiceTemplateUpdateSchema = z.object({ name: templateName, config: invoiceTemplateConfigSchema, version: z.number().int().positive() });
export const invoiceTemplateDeleteSchema = z.object({ version: z.coerce.number().int().positive() });

export function normalizedTemplateName(value: string) {
  return normalizeTemplateName(templateName.parse(value));
}

export function decodeInvoiceTemplateConfig(value: string | null | undefined) {
  if (!value) return cloneDefaultInvoiceTemplateConfig();
  const parsed: unknown = JSON.parse(value);
  return invoiceTemplateConfigSchema.parse(parsed);
}

export function decodeInvoiceTemplateSnapshot(value: string | null | undefined) {
  try {
    return decodeInvoiceTemplateConfig(value);
  } catch {
    return cloneDefaultInvoiceTemplateConfig();
  }
}

export type InvoiceTemplateCreateInput = z.infer<typeof invoiceTemplateCreateSchema>;
export type InvoiceTemplateUpdateInput = z.infer<typeof invoiceTemplateUpdateSchema>;
