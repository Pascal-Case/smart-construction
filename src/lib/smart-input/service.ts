import "server-only";

import { prisma } from "@/lib/db/prisma";
import { parseSmartInput } from "@/lib/smart-input/parser";
import { findSmartInputSuggestions, resolveSelectedMaster } from "@/lib/smart-input/suggestions";
import type { SmartInputTarget, SmartMasterOption, SmartSuggestionSource } from "@/lib/smart-input/types";

type SelectedMasterIds = { selectedSiteId?: string; selectedItemId?: string };

export async function previewSmartInput(target: SmartInputTarget, input: string, selectedIds: SelectedMasterIds = {}) {
  const [sites, items] = await loadActiveSmartInputMasters();
  const siteOptions = sites.map(toSiteOption);
  const itemOptions = items.map(toItemOption);
  const selectedSite = selectedIds.selectedSiteId ? resolveSelectedMaster(siteOptions, selectedIds.selectedSiteId, "현장", "SELECTED_SITE_INVALID") : undefined;
  const selectedItem = selectedIds.selectedItemId ? resolveSelectedMaster(itemOptions, selectedIds.selectedItemId, "품목", "SELECTED_ITEM_INVALID") : undefined;
  return parseSmartInput({
    target,
    input,
    sites: siteOptions,
    items: itemOptions,
    selectedSite,
    selectedItem,
  });
}

export async function suggestSmartInput(query: string) {
  const [sites, items] = await loadActiveSmartInputMasters();
  const sources: SmartSuggestionSource[] = [
    ...sites.map((site) => ({ ...toSiteOption(site), type: "SITE" as const, isActive: site.isActive })),
    ...items.map((item) => ({ ...toItemOption(item), type: "ITEM" as const, isActive: item.isActive })),
  ];
  return findSmartInputSuggestions(query, sources);
}

function loadActiveSmartInputMasters() {
  return Promise.all([
    prisma.site.findMany({ where: { isActive: true }, include: { aliases: { orderBy: { alias: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { isActive: true }, include: { aliases: { orderBy: { alias: "asc" } } }, orderBy: { name: "asc" } }),
  ]);
}

type SiteWithAliases = { id: string; code: string; name: string; isActive: boolean; aliases: Array<{ alias: string }> };
type ItemWithAliases = { id: string; code: string; name: string; unit: string; standardSalesPrice: number; standardCostPrice: number; isActive: boolean; aliases: Array<{ alias: string }> };

function toSiteOption(site: SiteWithAliases): SmartMasterOption {
  return { id: site.id, code: site.code, name: site.name, aliases: site.aliases.map((alias) => alias.alias) };
}

function toItemOption(item: ItemWithAliases): SmartMasterOption {
  return { id: item.id, code: item.code, name: item.name, aliases: item.aliases.map((alias) => alias.alias), unit: item.unit, standardSalesPrice: item.standardSalesPrice, standardCostPrice: item.standardCostPrice };
}
