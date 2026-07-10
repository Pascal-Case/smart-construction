import type { Prisma } from "@/generated/prisma/client";

export async function nextBusinessCode(
  tx: Prisma.TransactionClient,
  key: "site" | "item" | "contract",
) {
  const sequence = await tx.businessSequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  const prefix = key === "site" ? "SITE" : key === "item" ? "ITEM" : "CONTRACT";
  return `${prefix}-${String(sequence.value).padStart(4, "0")}`;
}

export async function nextInvoiceNo(tx: Prisma.TransactionClient, issueDate: Date) {
  const month = issueDate.toISOString().slice(0, 7).replace("-", "");
  const sequence = await tx.businessSequence.upsert({
    where: { key: `invoice:${month}` },
    create: { key: `invoice:${month}`, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `INV-${month}-${String(sequence.value).padStart(4, "0")}`;
}
