import type { Prisma } from "@/generated/prisma/client";

export async function nextBusinessCode(
  tx: Prisma.TransactionClient,
  key: "site" | "item",
) {
  const sequence = await tx.businessSequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  const prefix = key === "site" ? "SITE" : "ITEM";
  return `${prefix}-${String(sequence.value).padStart(4, "0")}`;
}
