"use client";

import { AlertTriangle, WandSparkles, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { buildSmartInputDraft } from "@/lib/smart-input/draft";
import { buildDirectRegistrationPayload } from "@/lib/smart-input/direct-registration";
import { currentTokenAt, moveSuggestionIndex, removeCurrentToken, shouldCommitSuggestion } from "@/lib/smart-input/token-editor";
import type {
  SmartFieldStatus,
  SmartInputAppliedDraft,
  SmartInputPreview,
  SmartInputSuggestion,
  SmartInputTarget,
  SmartMasterOption,
  SmartSuggestionType,
} from "@/lib/smart-input/types";

const statusLabels: Record<SmartFieldStatus, string> = {
  MATCHED: "문장 일치",
  DERIVED: "자동 제안",
  AMBIGUOUS: "선택 필요",
  MISSING: "입력 필요",
};

type SuggestionStatus = "idle" | "loading" | "ready" | "empty" | "error";
type ApiErrorBody = { error?: { code?: string; message?: string } };

export function SmartInputDialog({ target, onClose, onApply, onRegistered }: {
  target: SmartInputTarget;
  onClose: () => void;
  onApply: (draft: SmartInputAppliedDraft) => void;
  onRegistered: () => void;
}) {
  const inputId = "smart-input-" + target;
  const listboxId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionRequestRef = useRef<AbortController | null>(null);
  const [input, setInput] = useState("");
  const [caret, setCaret] = useState(0);
  const [composing, setComposing] = useState(false);
  const [suggestions, setSuggestions] = useState<SmartInputSuggestion[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>("idle");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedSite, setSelectedSite] = useState<SmartInputSuggestion | null>(null);
  const [selectedItem, setSelectedItem] = useState<SmartInputSuggestion | null>(null);
  const [badgeOrder, setBadgeOrder] = useState<SmartSuggestionType[]>([]);
  const [preview, setPreview] = useState<SmartInputPreview | null>(null);
  const [siteId, setSiteId] = useState("");
  const [itemId, setItemId] = useState("");
  const [busy, setBusy] = useState(false);

  const placeholder = target === "CONTRACT"
    ? "예: 현장·품목을 선택한 뒤 07/16 ~ 08/31 5대 8만원"
    : "예: 현장·품목을 선택한 뒤 07/16 2대 총액 40만원";
  const currentToken = useMemo(() => currentTokenAt(input, caret), [input, caret]);
  const tokenValue = currentToken?.value.trim() ?? "";
  const selectedSiteOption = preview?.options.sites.find((option) => option.id === siteId) ?? null;
  const selectedItemOption = preview?.options.items.find((option) => option.id === itemId) ?? null;
  const draft = useMemo(
    () => preview ? buildSmartInputDraft(preview, selectedSiteOption, selectedItemOption) : null,
    [preview, selectedSiteOption, selectedItemOption],
  );
  const ready = draft != null && (target === "REVENUE" || (draft.itemId != null && draft.quantity != null && draft.appliedSalesPrice != null));
  const effectiveSuggestionStatus = composing || tokenValue.length < 2 ? "idle" : suggestionStatus;
  const suggestionPanelOpen = effectiveSuggestionStatus !== "idle";
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;
  const liveStatus = effectiveSuggestionStatus === "loading"
    ? "추천 검색 중"
    : effectiveSuggestionStatus === "ready"
      ? `추천 ${suggestions.length}개. 방향키로 이동하고 Enter로 선택하세요.`
      : effectiveSuggestionStatus === "empty"
        ? "일치하는 현장·품목이 없습니다"
        : effectiveSuggestionStatus === "error"
          ? "추천을 불러오지 못했습니다"
          : "";

  useEffect(() => {
    if (composing || tokenValue.length < 2) return;

    const controller = new AbortController();
    suggestionRequestRef.current = controller;
    queueMicrotask(() => {
      if (controller.signal.aborted || suggestionRequestRef.current !== controller) return;
      setSuggestions([]);
      setSuggestionStatus("loading");
      setActiveIndex(-1);
    });
    const timer = window.setTimeout(async () => {
      if (controller.signal.aborted) return;
      try {
        const response = await fetch(`/api/smart-input/suggestions?q=${encodeURIComponent(tokenValue)}`, { signal: controller.signal });
        const body = await response.json() as { suggestions?: SmartInputSuggestion[] } & ApiErrorBody;
        if (!response.ok) throw new Error(body.error?.message ?? "추천을 불러오지 못했습니다.");
        if (controller.signal.aborted || suggestionRequestRef.current !== controller) return;
        const nextSuggestions = body.suggestions ?? [];
        setSuggestions(nextSuggestions);
        setSuggestionStatus(nextSuggestions.length ? "ready" : "empty");
      } catch (error) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setSuggestionStatus("error");
        if (error instanceof Error) toast.error(error.message);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (suggestionRequestRef.current === controller) suggestionRequestRef.current = null;
    };
  }, [composing, tokenValue]);

  function closeSuggestions() {
    suggestionRequestRef.current?.abort();
    suggestionRequestRef.current = null;
    setSuggestions([]);
    setSuggestionStatus("idle");
    setActiveIndex(-1);
  }

  function commitSuggestion(suggestion: SmartInputSuggestion) {
    const next = removeCurrentToken(input, caret);
    if (suggestion.type === "SITE") {
      setSelectedSite(suggestion);
      setSiteId(suggestion.id);
    } else {
      setSelectedItem(suggestion);
      setItemId(suggestion.id);
    }
    setBadgeOrder((current) => [...current.filter((type) => type !== suggestion.type), suggestion.type]);
    setInput(next.value);
    setCaret(next.cursor);
    setPreview(null);
    closeSuggestions();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function removeBadge(type: SmartSuggestionType) {
    if (type === "SITE") {
      setSelectedSite(null);
      setSiteId("");
    } else {
      setSelectedItem(null);
      setItemId("");
    }
    setBadgeOrder((current) => current.filter((value) => value !== type));
    setPreview(null);
  }

  function removeLastBadge() {
    const last = [...badgeOrder].reverse().find((type) => type === "SITE" ? selectedSite != null : selectedItem != null);
    if (last) removeBadge(last);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const isComposing = composing || event.nativeEvent.isComposing;
    if (event.key === "Escape" && suggestionPanelOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeSuggestions();
      return;
    }
    if (!isComposing && suggestionPanelOpen && suggestions.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setActiveIndex((current) => moveSuggestionIndex(current, event.key === "ArrowDown" ? 1 : -1, suggestions.length));
      return;
    }
    if (shouldCommitSuggestion({ key: event.key, isComposing, activeIndex, itemCount: suggestionPanelOpen ? suggestions.length : 0 })) {
      event.preventDefault();
      commitSuggestion(suggestions[activeIndex]);
      return;
    }
    if (event.key === "Backspace" && !isComposing && input.length === 0 && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
      event.preventDefault();
      removeLastBadge();
    }
  }

  function syncInput(textarea: HTMLTextAreaElement) {
    setInput(textarea.value);
    setCaret(textarea.selectionStart);
    setPreview(null);
  }

  async function analyze() {
    setBusy(true);
    setPreview(null);
    closeSuggestions();
    try {
      const response = await fetch("/api/smart-input/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          input,
          selectedSiteId: selectedSite?.id,
          selectedItemId: selectedItem?.id,
        }),
      });
      const body = await response.json() as SmartInputPreview & ApiErrorBody;
      if (!response.ok) {
        if (response.status === 409 && (body.error?.code === "SELECTED_SITE_INVALID" || body.error?.code === "SELECTED_ITEM_INVALID")) {
          removeBadge(body.error.code === "SELECTED_SITE_INVALID" ? "SITE" : "ITEM");
          const message = body.error.message ?? "선택한 항목이 변경되었습니다. 다시 선택해 주세요.";
          toast.error(message.includes("다시 선택해 주세요") ? message : `${message} 다시 선택해 주세요.`);
          requestAnimationFrame(() => textareaRef.current?.focus());
          return;
        }
        throw new Error(body.error?.message ?? "문장을 분석하지 못했습니다.");
      }
      const result = body as SmartInputPreview;
      setPreview(result);
      setSiteId(result.fields.site.value?.id ?? selectedSite?.id ?? "");
      setItemId(result.fields.item.value?.id ?? selectedItem?.id ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "문장을 분석하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function registerDirectly() {
    if (!draft || !ready) return;
    setBusy(true);
    try {
      const label = target === "CONTRACT" ? "계약" : "매출";
      const response = await fetch(target === "CONTRACT" ? "/api/contracts" : "/api/revenues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildDirectRegistrationPayload(target, draft)),
      });
      const body = await response.json() as ApiErrorBody;
      if (!response.ok) throw new Error(body.error?.message ?? `${label}을 등록하지 못했습니다.`);
      toast.success(`${label}을 등록했습니다.`);
      onRegistered();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function changeFallbackMaster(type: SmartSuggestionType, value: string, options: SmartMasterOption[]) {
    const option = options.find((candidate) => candidate.id === value);
    if (type === "SITE") setSiteId(value);
    else setItemId(value);
    if (!option) {
      if (type === "SITE") setSelectedSite(null);
      else setSelectedItem(null);
      setBadgeOrder((current) => current.filter((entry) => entry !== type));
      return;
    }
    const suggestion: SmartInputSuggestion = { id: option.id, code: option.code, name: option.name, type };
    if (type === "SITE") setSelectedSite(suggestion);
    else setSelectedItem(suggestion);
    setBadgeOrder((current) => [...current.filter((entry) => entry !== type), type]);
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><WandSparkles className="size-5 text-teal-700" />문장으로 빠른 입력</DialogTitle>
        <DialogDescription>현장·품목을 명시적으로 선택하고 날짜·수량·금액을 규칙으로 분석합니다. 분석 결과는 저장되지 않고 등록 폼에만 적용됩니다.</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
          <p className="text-sm font-medium">선택한 현장·품목</p>
          <div className="flex min-h-7 flex-wrap gap-2">
            {selectedSite && <SelectedBadge suggestion={selectedSite} disabled={busy} onRemove={() => removeBadge("SITE")} />}
            {selectedItem && <SelectedBadge suggestion={selectedItem} disabled={busy} onRemove={() => removeBadge("ITEM")} />}
            {!selectedSite && !selectedItem && <p className="text-xs text-muted-foreground">아래 입력창에 현장명·품목명을 입력한 뒤 추천에서 선택하세요.</p>}
          </div>
        </div>

        <div className="relative space-y-2">
          <Label htmlFor={inputId}>날짜·수량·금액과 현장·품목 검색</Label>
          <textarea
            ref={textareaRef}
            id={inputId}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={suggestionPanelOpen}
            aria-activedescendant={activeOptionId}
            aria-describedby={`${listboxId}-help ${listboxId}-status`}
            value={input}
            disabled={busy}
            placeholder={placeholder}
            onChange={(event) => syncInput(event.currentTarget)}
            onInput={(event) => syncInput(event.currentTarget)}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(event) => {
              const textarea = event.currentTarget;
              setComposing(false);
              requestAnimationFrame(() => syncInput(textarea));
            }}
            rows={4}
            maxLength={1_000}
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p id={`${listboxId}-help`} className="text-xs text-muted-foreground">현재 단어로 현장·품목을 검색합니다. 방향키와 Enter로 선택하고, 빈 입력에서 Backspace로 마지막 배지를 제거할 수 있습니다.</p>
          <p id={`${listboxId}-status`} aria-live="polite" className="sr-only">{liveStatus}</p>

          {suggestionPanelOpen && <div id={listboxId} role="listbox" aria-label="현장·품목 추천" className="z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
            {effectiveSuggestionStatus === "loading" && <SuggestionMessage>추천 검색 중...</SuggestionMessage>}
            {effectiveSuggestionStatus === "empty" && <SuggestionMessage>일치하는 현장·품목이 없습니다.</SuggestionMessage>}
            {effectiveSuggestionStatus === "error" && <SuggestionMessage tone="error">추천을 불러오지 못했습니다. 잠시 후 다시 입력해 주세요.</SuggestionMessage>}
            {effectiveSuggestionStatus === "ready" && <div className="max-h-64 overflow-y-auto p-1">
              {suggestions.map((suggestion, index) => <button
                key={`${suggestion.type}-${suggestion.id}`}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${activeIndex === index ? "bg-teal-50 text-teal-950 dark:bg-teal-950 dark:text-teal-50" : "hover:bg-muted"}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitSuggestion(suggestion)}
              >
                <span>{suggestionLabel(suggestion)}</span>
                <Badge variant="outline">{suggestion.type === "SITE" ? "현장" : "품목"}</Badge>
              </button>)}
            </div>}
          </div>}
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>선택한 배지는 분석 요청에 명시적으로 전달되며 자동 선택되지 않습니다.</span><span>{input.length}/1,000</span></div>
      </div>

      <div className="flex justify-end"><Button disabled={busy || input.trim().length < 3} onClick={() => void analyze()}><WandSparkles data-icon="inline-start" />{busy ? "분석 중..." : "문장 분석"}</Button></div>

      {preview && <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border bg-muted/50 px-4 py-3">
          <div><p className="font-semibold">필드별 분석 결과</p><p className="text-xs text-muted-foreground">잘못 인식된 값은 아래에서 선택하거나 등록 폼에서 수정하세요.</p></div>
          <Badge variant={preview.confidence >= 80 ? "secondary" : "outline"}>신뢰도 {preview.confidence}%</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MasterCard label="현장" field={preview.fields.site} value={siteId} options={preview.options.sites} onChange={(value) => changeFallbackMaster("SITE", value, preview.options.sites)} required />
          <MasterCard label="품목" field={preview.fields.item} value={itemId} options={preview.options.items} onChange={(value) => changeFallbackMaster("ITEM", value, preview.options.items)} required={target === "CONTRACT"} />
          <ValueCard label="수량" status={preview.fields.quantity.status} value={preview.fields.quantity.value == null ? "-" : preview.fields.quantity.value + " " + (preview.fields.quantity.unit ?? selectedItemOption?.unit ?? "")} message={preview.fields.quantity.message} />
          <ValueCard label="단가" status={preview.fields.unitPrice.status} value={money(draft?.appliedSalesPrice)} message={preview.fields.unitPrice.message} />
          <ValueCard label="총액" status={preview.fields.totalAmount.status} value={money(draft?.salesAmount)} message={preview.fields.totalAmount.message} />
          <ValueCard label={target === "CONTRACT" ? "계약·매출 기간" : "귀속일"} status={preview.fields.period.status} value={preview.fields.period.value ? preview.fields.period.value.startDate + (preview.fields.period.value.startDate === preview.fields.period.value.endDate ? "" : " ~ " + preview.fields.period.value.endDate) : "-"} message={preview.fields.period.message} />
        </div>
        {preview.warnings.length > 0 && <Alert className="border-amber-300 bg-amber-50 text-amber-950"><AlertTriangle /><AlertTitle>확인이 필요한 항목</AlertTitle><AlertDescription><ul className="list-disc space-y-1 pl-4">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert>}
        <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-sm text-teal-950">
          <p className="font-medium">적용 예정: {draft?.title ?? "-"}</p>
          <p className="mt-1 text-xs">등록 폼 적용 후에는 모든 값을 수정할 수 있습니다. 바로 등록하면 현재 분석 결과가 즉시 저장됩니다.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onClose}>취소</Button><Button variant="outline" disabled={busy || !ready} onClick={() => { if (draft && ready) onApply(draft); }}>등록 폼 적용</Button><Button disabled={busy || !ready} onClick={() => void registerDirectly()}>{busy ? "등록 중..." : target === "CONTRACT" ? "계약 등록" : "매출 등록"}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}

function SelectedBadge({ suggestion, disabled, onRemove }: { suggestion: SmartInputSuggestion; disabled: boolean; onRemove: () => void }) {
  const typeLabel = suggestion.type === "SITE" ? "현장" : "품목";
  return <Badge variant="secondary" className="h-7 gap-1 pl-2.5 pr-1">
    <span>{suggestionLabel(suggestion)}</span>
    <button type="button" disabled={disabled} aria-label={`선택한 ${typeLabel} 제거`} className="rounded-full p-0.5 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" onClick={onRemove}>
      <X className="size-3" />
    </button>
  </Badge>;
}

function suggestionLabel(suggestion: SmartInputSuggestion) {
  return suggestion.type === "SITE" ? `${suggestion.name} · ${suggestion.code} / 현장` : `${suggestion.name} / 품목`;
}

function SuggestionMessage({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "error" }) {
  return <p role="status" className={`px-3 py-4 text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>{children}</p>;
}

function MasterCard({ label, field, value, options, onChange, required }: {
  label: string;
  field: SmartInputPreview["fields"]["site"];
  value: string;
  options: SmartMasterOption[];
  onChange: (value: string) => void;
  required: boolean;
}) {
  return <div className="space-y-2 rounded-xl border bg-card p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{label}{required ? " *" : ""}</p><StatusBadge status={field.status} /></div><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border bg-background px-2 text-sm"><option value="">{required ? "선택해 주세요" : "선택 안 함"}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.code})</option>)}</select><p className="text-xs text-muted-foreground">{field.message}</p></div>;
}
function ValueCard({ label, status, value, message }: { label: string; status: SmartFieldStatus; value: string; message: string }) {
  return <div className="space-y-2 rounded-xl border bg-card p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">{label}</p><StatusBadge status={status} /></div><p className="font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{message}</p></div>;
}
function StatusBadge({ status }: { status: SmartFieldStatus }) { return <Badge variant={status === "MATCHED" || status === "DERIVED" ? "secondary" : "outline"}>{statusLabels[status]}</Badge>; }
function money(value: number | null | undefined) { return value == null ? "-" : value.toLocaleString() + "원"; }
