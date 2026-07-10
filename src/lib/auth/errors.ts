import { ZodError } from "zod";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "입력값을 확인해 주세요." } },
      { status: 400 },
    );
  }

  if (error instanceof AuthError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "처리 중 오류가 발생했습니다." } },
    { status: 500 },
  );
}
