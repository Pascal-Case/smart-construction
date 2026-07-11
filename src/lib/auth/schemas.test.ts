import { describe, expect, it } from "vitest";

import { createUserSchema, loginIdSchema, passwordSchema } from "@/lib/auth/schemas";

describe("auth schemas", () => {
  it("로그인 아이디를 소문자로 정규화한다", () => {
    expect(loginIdSchema.parse(" Admin.User ")).toBe("admin.user");
  });

  it("영문과 숫자를 포함한 5자 이상 비밀번호만 허용한다", () => {
    expect(passwordSchema.safeParse("a1b2c").success).toBe(true);
    expect(passwordSchema.safeParse("a1b2").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("12345").success).toBe(false);
  });

  it("세 역할만 사용자 생성에 허용한다", () => {
    const base = { loginId: "manager1", name: "관리자", password: "password1234" };
    expect(createUserSchema.safeParse({ ...base, role: "MANAGER" }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...base, role: "OWNER" }).success).toBe(false);
  });
});
