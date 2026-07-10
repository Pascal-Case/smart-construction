export function normalizeAlias(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function normalizeCode(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function cleanAliases(values: string[], masterName: string) {
  const nameKey = normalizeAlias(masterName);
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const alias = value.normalize("NFKC").trim().replace(/\s+/g, " ");
    const normalizedAlias = normalizeAlias(alias);
    if (!alias || normalizedAlias === nameKey || seen.has(normalizedAlias)) return [];
    seen.add(normalizedAlias);
    return [{ alias, normalizedAlias }];
  });
}
