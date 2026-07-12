import { z } from "zod";

import { INVOICE_TEMPLATE_SYSTEM_ID } from "@/lib/invoice-templates/config";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "월은 YYYY-MM 형식이어야 합니다.");

const candidateQuery = z.object({
  month,
  siteId: z.string().default(""),
});

export const invoiceCandidateQuerySchema = candidateQuery;

export const invoiceIssueInputSchema = z.object({
  cycles: z.array(z.object({
    cycleId: z.string().min(1),
    expectedCloseVersion: z.number().int().positive(),
    expectedRevenueFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  })).min(1, "발행할 마감 회차를 선택해 주세요.").max(500),
  issueDate: z.iso.date(),
  displayMode: z.enum(["AGGREGATED", "ITEMIZED"]),
  memo: z.string().trim().max(500).optional().nullable(),
  templateId: z.string().min(1).default(INVOICE_TEMPLATE_SYSTEM_ID),
  templateVersion: z.number().int().positive().default(1),
}).superRefine((value, context) => {
  const ids = value.cycles.map((cycle) => cycle.cycleId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "중복된 마감 회차가 포함되어 있습니다.", path: ["cycles"] });
});

export const invoiceReplacementPreviewInputSchema = z.object({
  sourceVersion: z.number().int().positive(),
  issueDate: z.iso.date(),
  displayMode: z.enum(["AGGREGATED", "ITEMIZED"]),
  memo: z.string().trim().max(500).optional().nullable(),
  templateId: z.string().min(1).default(INVOICE_TEMPLATE_SYSTEM_ID),
  templateVersion: z.number().int().positive().default(1),
});

export const invoiceReplacementIssueInputSchema = invoiceReplacementPreviewInputSchema.extend({
  expectedRevenueEntryIds: z.array(z.string().min(1)).min(1, "대체 발행할 매출이 없습니다.").max(500, "한 번에 최대 500건까지 발행할 수 있습니다."),
}).superRefine((value, context) => {
  if (new Set(value.expectedRevenueEntryIds).size !== value.expectedRevenueEntryIds.length) {
    context.addIssue({ code: "custom", message: "중복된 매출 선택이 포함되어 있습니다.", path: ["expectedRevenueEntryIds"] });
  }
});

export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  siteId: z.string().default(""),
  startDate: z.union([z.iso.date(), z.literal("")]).default(""),
  endDate: z.union([z.iso.date(), z.literal("")]).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: "종료일은 시작일보다 빠를 수 없습니다.", path: ["endDate"] });

export type InvoiceCandidateQuery = z.infer<typeof invoiceCandidateQuerySchema>;
export type InvoiceIssueInput = z.infer<typeof invoiceIssueInputSchema>;
export type InvoiceReplacementPreviewInput = z.infer<typeof invoiceReplacementPreviewInputSchema>;
export type InvoiceReplacementIssueInput = z.infer<typeof invoiceReplacementIssueInputSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
