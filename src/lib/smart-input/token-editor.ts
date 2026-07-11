export type CurrentToken = {
  value: string;
  start: number;
  end: number;
};

export function currentTokenAt(value: string, cursor: number): CurrentToken | null {
  const safeCursor = clampCursor(value, cursor);
  if (!value || (safeCursor < value.length && isWhitespace(value[safeCursor]))) return null;

  let start = safeCursor;
  while (start > 0 && !isWhitespace(value[start - 1])) start -= 1;

  let end = safeCursor;
  while (end < value.length && !isWhitespace(value[end])) end += 1;

  if (start === end) return null;
  return { value: value.slice(start, end), start, end };
}

export function removeCurrentToken(value: string, cursor: number) {
  const safeCursor = clampCursor(value, cursor);
  const token = currentTokenAt(value, safeCursor);
  if (!token) return { value, cursor: safeCursor };

  const before = value.slice(0, token.start);
  const after = value.slice(token.end);
  if (!before) {
    const nextValue = after.trimStart();
    return { value: nextValue, cursor: 0 };
  }
  if (!after) {
    const nextValue = before.trimEnd();
    return { value: nextValue, cursor: nextValue.length };
  }

  const normalizedAfter = isWhitespace(before.at(-1) ?? "") ? after.replace(/^\s+/, "") : after;
  return { value: before + normalizedAfter, cursor: before.length };
}

export function moveSuggestionIndex(currentIndex: number, direction: -1 | 1, itemCount: number) {
  const count = Math.max(0, Math.trunc(itemCount));
  if (count === 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) return direction > 0 ? 0 : count - 1;
  return (currentIndex + direction + count) % count;
}

export function shouldCommitSuggestion({ key, isComposing, activeIndex, itemCount }: {
  key: string;
  isComposing: boolean;
  activeIndex: number;
  itemCount: number;
}) {
  return key === "Enter" && !isComposing && activeIndex >= 0 && activeIndex < itemCount;
}

function clampCursor(value: string, cursor: number) {
  if (!Number.isFinite(cursor)) return value.length;
  return Math.min(value.length, Math.max(0, Math.trunc(cursor)));
}

function isWhitespace(value: string) {
  return /\s/u.test(value);
}
