import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit/record";
import type { SessionUser } from "@/lib/auth/dto";
import { AuthError } from "@/lib/auth/errors";
import type { CompanySettingInput } from "@/lib/company/schemas";
import { prisma } from "@/lib/db/prisma";

const EMPTY_SETTING = {
  id: "default",
  businessRegistrationNo: "",
  companyName: "",
  representativeName: "",
  address: "",
  businessType: "",
  businessItem: "",
  phone: "",
  defaultMessage: "아래와 같이 공급합니다.",
  version: null,
  updatedAt: null,
};

export async function getCompanySetting() {
  const setting = await prisma.companySetting.findUnique({ where: { id: "default" } });
  return setting ?? EMPTY_SETTING;
}

export async function saveCompanySetting(actor: SessionUser, input: CompanySettingInput) {
  const { version, ...data } = input;
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.companySetting.findUnique({ where: { id: "default" } });
      if (!current) {
        if (version != null) throw new AuthError("공급자 설정 상태가 변경되었습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
        const created = await tx.companySetting.create({ data: { id: "default", ...data, createdById: actor.id, updatedById: actor.id } });
        await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "CREATE", entityType: "COMPANY_SETTING", entityId: created.id, after: created });
        return created;
      }
      if (version == null) throw new AuthError("다른 사용자가 공급자 설정을 먼저 만들었습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
      const updated = await tx.companySetting.updateMany({ where: { id: current.id, version }, data: { ...data, updatedById: actor.id, version: { increment: 1 } } });
      if (!updated.count) throw new AuthError("다른 사용자가 공급자 설정을 먼저 수정했습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
      const saved = await tx.companySetting.findUniqueOrThrow({ where: { id: current.id } });
      await recordAudit(tx, { actorId: actor.id, actorName: actor.name, action: "UPDATE", entityType: "COMPANY_SETTING", entityId: saved.id, before: current, after: saved });
      return saved;
    });
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AuthError("다른 사용자가 공급자 설정을 먼저 만들었습니다. 다시 불러와 주세요.", 409, "VERSION_CONFLICT");
    throw error;
  }
}

export function isCompanySettingComplete(setting: Awaited<ReturnType<typeof getCompanySetting>>) {
  return [setting.businessRegistrationNo, setting.companyName, setting.representativeName, setting.address, setting.businessType, setting.businessItem, setting.phone, setting.defaultMessage].every(Boolean);
}
