export const INVOICE_TEMPLATE_SYSTEM_ID = "system-default";
export const INVOICE_TEMPLATE_SCHEMA_VERSION = 1 as const;
export const INVOICE_GRID_COLUMNS = 24;
export const INVOICE_GRID_ROWS = 34;
export const INVOICE_PAGE_CONTENT_HEIGHT_MM = 281;

export const INVOICE_BLOCK_KEYS = ["title", "recipient", "supplier", "table", "total", "memo"] as const;
export const INVOICE_COLUMN_KEYS = ["itemName", "specification", "quantity", "unit", "unitPrice", "supplyAmount"] as const;
export const INVOICE_FONT_FAMILIES = ["Malgun Gothic", "Noto Sans KR", "Arial", "serif"] as const;

export type InvoiceBlockKey = (typeof INVOICE_BLOCK_KEYS)[number];
export type InvoiceColumnKey = (typeof INVOICE_COLUMN_KEYS)[number];
export type InvoiceFontFamily = (typeof INVOICE_FONT_FAMILIES)[number];

export type InvoiceTemplateStyle = {
  fontFamily: InvoiceFontFamily;
  fontSizePt: number;
  fontWeight: 400 | 600 | 700;
  textColor: string;
  backgroundColor: string;
  borderColor: string;
};

export type InvoiceTemplateBlock = {
  x: number;
  y: number;
  width: number;
  height: number;
  style: InvoiceTemplateStyle;
};

export type InvoiceTemplateColumn = {
  key: InvoiceColumnKey;
  width: number;
  visible: boolean;
};

export type InvoiceTemplateConfig = {
  schemaVersion: typeof INVOICE_TEMPLATE_SCHEMA_VERSION;
  blocks: Record<InvoiceBlockKey, InvoiceTemplateBlock>;
  columns: InvoiceTemplateColumn[];
};

export type InvoiceTemplateView = {
  id: string;
  name: string;
  isSystem: boolean;
  config: InvoiceTemplateConfig;
  version: number;
  updatedAt: string | null;
};

const baseStyle = (fontSizePt: number, fontWeight: InvoiceTemplateStyle["fontWeight"]): InvoiceTemplateStyle => ({
  fontFamily: "Malgun Gothic",
  fontSizePt,
  fontWeight,
  textColor: "#111827",
  backgroundColor: "#ffffff",
  borderColor: "#111111",
});

export const DEFAULT_INVOICE_TEMPLATE_CONFIG: InvoiceTemplateConfig = {
  schemaVersion: INVOICE_TEMPLATE_SCHEMA_VERSION,
  blocks: {
    title: { x: 0, y: 0, width: 24, height: 3, style: baseStyle(25.5, 700) },
    recipient: { x: 0, y: 3, width: 13, height: 5, style: baseStyle(9, 600) },
    supplier: { x: 13, y: 3, width: 11, height: 5, style: baseStyle(7.2, 600) },
    table: { x: 0, y: 8, width: 24, height: 15, style: baseStyle(7.8, 400) },
    total: { x: 0, y: 23, width: 24, height: 2, style: baseStyle(9.1, 700) },
    memo: { x: 0, y: 25, width: 24, height: 2, style: baseStyle(7.4, 400) },
  },
  columns: [
    { key: "itemName", width: 25, visible: true },
    { key: "specification", width: 25, visible: true },
    { key: "quantity", width: 8, visible: true },
    { key: "unit", width: 8, visible: true },
    { key: "unitPrice", width: 15, visible: true },
    { key: "supplyAmount", width: 19, visible: true },
  ],
};

export const INVOICE_COLUMN_LABELS: Record<InvoiceColumnKey, string> = {
  itemName: "품 명",
  specification: "규 격",
  quantity: "수량",
  unit: "단위",
  unitPrice: "단 가",
  supplyAmount: "금 액",
};

export function normalizeTemplateName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function calculateRowsPerPage(config: InvoiceTemplateConfig) {
  const table = config.blocks.table;
  const tableHeightMm = (table.height / INVOICE_GRID_ROWS) * INVOICE_PAGE_CONTENT_HEIGHT_MM;
  const headerHeightMm = 8;
  const rowHeightMm = Math.max(9.6, table.style.fontSizePt * 0.45 + 4);
  return Math.max(1, Math.floor((tableHeightMm - headerHeightMm) / rowHeightMm));
}

export function cloneDefaultInvoiceTemplateConfig() {
  return structuredClone(DEFAULT_INVOICE_TEMPLATE_CONFIG);
}
