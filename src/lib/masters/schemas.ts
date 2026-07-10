import { z } from "zod";

const nullableText = z.string().trim().max(500).optional().nullable();
const optionalDate = z.union([z.iso.date(), z.literal(""), z.null()]).optional();
const aliases = z.array(z.string().trim().min(1).max(80)).max(20).default([]);
const code = z.string().trim().max(30).regex(/^[A-Za-z0-9._-]+$/, "코드는 영문, 숫자, . _ -만 사용할 수 있습니다.");

export const siteInputSchema = z.object({
  code: z.union([code, z.literal("")]).optional(),
  name: z.string().trim().min(1, "현장명을 입력해 주세요.").max(100),
  customerName: nullableText,
  address: nullableText,
  managerName: nullableText,
  managerContact: nullableText,
  startDate: optionalDate,
  endDate: optionalDate,
  isActive: z.boolean().default(true),
  memo: nullableText,
  aliases,
}).refine((value) => !value.startDate || !value.endDate || value.startDate <= value.endDate, {
  message: "종료일은 시작일보다 빠를 수 없습니다.",
  path: ["endDate"],
});

export const itemInputSchema = z.object({
  code: z.union([code, z.literal("")]).optional(),
  name: z.string().trim().min(1, "품목명을 입력해 주세요.").max(100),
  unit: z.string().trim().min(1, "단위를 입력해 주세요.").max(30),
  standardSalesPrice: z.number().int().min(0).max(2_000_000_000),
  standardCostPrice: z.number().int().min(0).max(2_000_000_000),
  isActive: z.boolean().default(true),
  memo: nullableText,
  aliases,
});

export const siteUpdateSchema = siteInputSchema.and(z.object({ version: z.number().int().positive() }));
export const itemUpdateSchema = itemInputSchema.and(z.object({ version: z.number().int().positive() }));

export const masterListQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["all", "active", "inactive"]).default("active"),
  sort: z.enum(["code", "name", "updatedAt"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
});

export type SiteInput = z.infer<typeof siteInputSchema>;
export type ItemInput = z.infer<typeof itemInputSchema>;
export type MasterListQuery = z.infer<typeof masterListQuerySchema>;
