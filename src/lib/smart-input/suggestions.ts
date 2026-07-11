import { AuthError } from "@/lib/auth/errors";
import type { SmartInputSuggestion, SmartMasterOption, SmartSuggestionSource, SmartSuggestionType } from "@/lib/smart-input/types";

const MAX_SUGGESTIONS = 8;

type RankedSuggestion = {
  source: SmartSuggestionSource;
  matchRank: number;
  fieldRank: number;
  termLength: number;
};

export function findSmartInputSuggestions(query: string, sources: SmartSuggestionSource[]): SmartInputSuggestion[] {
  const queryKey = compact(query);
  if (queryKey.length < 2) return [];

  return sources
    .flatMap((source): RankedSuggestion[] => {
      if (!source.isActive) return [];
      const matches = [
        { value: source.name, fieldRank: 0 },
        { value: source.code, fieldRank: 1 },
        ...source.aliases.map((value) => ({ value, fieldRank: 2 })),
      ].flatMap(({ value, fieldRank }) => {
        const term = compact(value);
        if (!term.includes(queryKey)) return [];
        const matchRank = term === queryKey ? 0 : term.startsWith(queryKey) ? 1 : 2;
        return [{ source, matchRank, fieldRank, termLength: term.length }];
      });
      return matches.sort(compareRanked).slice(0, 1);
    })
    .sort(compareRanked)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ source }) => toSuggestion(source));
}

export function resolveSelectedMaster(options: SmartMasterOption[], id: string, label: string, errorCode = "SELECTED_MASTER_INVALID"): SmartMasterOption {
  const selected = options.find((option) => option.id === id);
  if (!selected) throw new AuthError(`선택한 ${label}이 없거나 사용 중지되었습니다. 다시 선택해 주세요.`, 409, errorCode);
  return selected;
}

function compareRanked(a: RankedSuggestion, b: RankedSuggestion) {
  return a.matchRank - b.matchRank
    || a.fieldRank - b.fieldRank
    || a.termLength - b.termLength
    || typeRank(a.source.type) - typeRank(b.source.type)
    || a.source.name.localeCompare(b.source.name, "ko-KR")
    || a.source.code.localeCompare(b.source.code, "ko-KR");
}

function typeRank(type: SmartSuggestionType) {
  return type === "SITE" ? 0 : 1;
}

function toSuggestion(source: SmartSuggestionSource): SmartInputSuggestion {
  return {
    id: source.id,
    code: source.code,
    name: source.name,
    type: source.type,
  };
}

function compact(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, "");
}
