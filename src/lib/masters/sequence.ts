import type { Prisma } from "@/generated/prisma/client";

export async function nextBusinessCode(
  tx: Prisma.TransactionClient,
  key: "site" | "item" | "contract",
) {
  let sequence = await tx.businessSequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  const prefix = key === "site" ? "SITE" : key === "item" ? "ITEM" : "CONTRACT";
  const codes = key === "site"
    ? await tx.site.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } })
    : key === "item"
      ? await tx.item.findMany({ where: { code: { startsWith: `${prefix}-` } }, select: { code: true } })
      : await tx.contract.findMany({ where: { contractNo: { startsWith: `${prefix}-` } }, select: { contractNo: true } });
  const codePattern = new RegExp(`^${prefix}-(\\d+)$`);
  const highestExisting = codes.reduce((highest, row) => {
    const code = "code" in row ? row.code : row.contractNo;
    const match = codePattern.exec(code);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  if (sequence.value <= highestExisting) {
    sequence = await tx.businessSequence.update({
      where: { key },
      data: { value: highestExisting + 1 },
    });
  }

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
