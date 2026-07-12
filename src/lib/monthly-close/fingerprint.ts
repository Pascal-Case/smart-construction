import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    const sorted = [...value].sort((left, right) => arraySortKey(left).localeCompare(arraySortKey(right)));
    return "[" + sorted.map(canonicalJson).join(",") + "]";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return "{" + entries.map(([key, item]) => JSON.stringify(key) + ":" + canonicalJson(item)).join(",") + "}";
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Fingerprint values must be finite.");
  return JSON.stringify(value);
}

export function stableFingerprint(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function arraySortKey(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["id", "generatedKey", "key", "exceptionKey"]) {
      if (typeof record[key] === "string") return key + ":" + record[key];
    }
  }
  return canonicalJson(value);
}
