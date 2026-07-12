import { z } from "zod";

import { INVOICE_TEMPLATE_SYSTEM_ID } from "@/lib/invoice-templates/config";

const dateRange = z.object({
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  siteId: z.string().default(""),
}).superRefine((value, context) => {
  if (value.startDate > value.endDate) context.addIssue({ code: "custom", message: "종료일은 시작일보다 빠를 수 없습니다.", path: ["endDate"] });
  const start = new Date(`${value.startDate}T00:00:00.000Z`);
  const end = new Date(`${value.endDate}T00:00:00.000Z`);
  if ((end.getTime() - start.getTime()) / 86_400_000 > 366) context.addIssue({ code: "custom", message: "한 번에 최대 1년까지 조회할 수 있습니다.", path: ["endDate"] });
});

export const invoiceCandidateQuerySchema = dateRange;

export const invoiceIssueInputSchema = z.object({
  revenueEntryIds: z.array(z.string().min(1)).min(1, "발행할 매출을 선택해 주세요.").max(500, "한 번에 최대 500건까지 발행할 수 있습니다."),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  issueDate: z.iso.date(),
  displayMode: z.enum(["AGGREGATED", "ITEMIZED"]),
  memo: z.string().trim().max(500).optional().nullable(),
  templateId: z.string().min(1).default(INVOICE_TEMPLATE_SYSTEM_ID),
  templateVersion: z.number().int().positive().default(1),
}).superRefine((value, context) => {
  if (value.periodStart > value.periodEnd) context.addIssue({ code: "custom", message: "종료일은 시작일보다 빠를 수 없습니다.", path: ["periodEnd"] });
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
