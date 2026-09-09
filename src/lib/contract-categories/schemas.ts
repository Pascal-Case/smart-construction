import { z } from "zod";

export const contractCategoryCreateSchema = z.object({
  name: z.string().trim().min(1, "계약 구분명을 입력해 주세요.").max(100),
});

export const contractCategoryUpdateSchema = z.object({
  name: z.string().trim().min(1, "계약 구분명을 입력해 주세요.").max(100).optional(),
  isActive: z.boolean().optional(),
  version: z.number().int().positive(),
}).refine((value) => value.name !== undefined || value.isActive !== undefined, { message: "변경할 내용을 입력해 주세요." });
