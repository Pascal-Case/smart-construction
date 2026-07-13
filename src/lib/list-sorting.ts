export type SortDirection = "asc" | "desc";

export type ExplicitSort<Key extends string = string> = {
  key: Key;
  direction: SortDirection;
} | null;

export function toggleSort<Key extends string>(current: ExplicitSort<Key>, key: Key): ExplicitSort<Key> {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

export function parseExplicitSort<Key extends string>(
  params: URLSearchParams,
  allowedKeys: readonly Key[],
): ExplicitSort<Key> {
  const key = params.get("sort");
  const direction = params.get("order");
  if (!key || !allowedKeys.includes(key as Key) || (direction !== "asc" && direction !== "desc")) return null;
  return { key: key as Key, direction };
}

export function serializeListQuery<Key extends string>(
  source: URLSearchParams,
  sort: ExplicitSort<Key>,
  options: { resetPage?: boolean } = {},
) {
  const params = new URLSearchParams(source);
  if (sort) {
    params.set("sort", sort.key);
    params.set("order", sort.direction);
  } else {
    params.delete("sort");
    params.delete("order");
  }
  if (options.resetPage) params.set("page", "1");
  return params;
}

export function compareNullable<T>(
  left: T | null | undefined,
  right: T | null | undefined,
  compare: (left: T, right: T) => number,
  direction: SortDirection,
) {
  const leftMissing = left == null;
  const rightMissing = right == null;
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }
  return compare(left, right) * (direction === "asc" ? 1 : -1);
}
