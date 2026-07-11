import { z } from "zod";

export const loginIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "아이디는 3자 이상이어야 합니다.")
  .max(40, "아이디는 40자 이하여야 합니다.")
  .regex(/^[a-z0-9._-]+$/, "아이디는 영문 소문자, 숫자, . _ -만 사용할 수 있습니다.");

export const passwordSchema = z
  .string()
  .min(5, "비밀번호는 5자 이상이어야 합니다.")
  .max(100, "비밀번호는 100자 이하여야 합니다.")
  .regex(/[A-Za-z]/, "비밀번호에 영문자를 포함해야 합니다.")
  .regex(/[0-9]/, "비밀번호에 숫자를 포함해야 합니다.");

export const setupSchema = z.object({
  loginId: loginIdSchema,
  name: z.string().trim().min(2).max(40),
  password: passwordSchema,
});

export const loginSchema = z.object({
  loginId: loginIdSchema,
  password: z.string().min(1).max(100),
});

export const createUserSchema = setupSchema.extend({
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(40),
  role: z.enum(["ADMIN", "MANAGER", "VIEWER"]),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  password: z.union([passwordSchema, z.literal("")]).optional(),
});
