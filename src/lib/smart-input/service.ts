import "server-only";

import { prisma } from "@/lib/db/prisma";
import { parseSmartInput } from "@/lib/smart-input/parser";
import type { SmartInputTarget, SmartMasterOption } from "@/lib/smart-input/types";

export async function previewSmartInput(target: SmartInputTarget, input: string) {
  const [sites, items] = await Promise.all([
    prisma.site.findMany({ where: { isActive: true }, include: { aliases: { orderBy: { alias: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { isActive: true }, include: { aliases: { orderBy: { alias: "asc" } } }, orderBy: { name: "asc" } }),
  ]);
  return parseSmartInput({
    target,
    input,
    sites: sites.map((site): SmartMasterOption => ({ id: site.id, code: site.code, name: site.name, aliases: site.aliases.map((alias) => alias.alias) })),
    items: items.map((item): SmartMasterOption => ({ id: item.id, code: item.code, name: item.name, aliases: item.aliases.map((alias) => alias.alias), unit: item.unit, standardSalesPrice: item.standardSalesPrice, standardCostPrice: item.standardCostPrice })),
  });
}
