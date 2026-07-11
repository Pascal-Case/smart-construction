export type SmartInputTarget = "CONTRACT" | "REVENUE";
export type SmartFieldStatus = "MATCHED" | "DERIVED" | "AMBIGUOUS" | "MISSING";

export type SmartMasterOption = {
  id: string;
  code: string;
  name: string;
  aliases: string[];
  unit?: string;
  standardSalesPrice?: number;
  standardCostPrice?: number;
};

export type SmartSuggestionType = "SITE" | "ITEM";

export type SmartSuggestionSource = SmartMasterOption & {
  type: SmartSuggestionType;
  isActive: boolean;
};

export type SmartInputSuggestion = Pick<SmartMasterOption, "id" | "code" | "name"> & {
  type: SmartSuggestionType;
};

export type SmartMasterField = {
  status: SmartFieldStatus;
  value: SmartMasterOption | null;
  candidates: SmartMasterOption[];
  matchedText: string | null;
  message: string;
};

export type SmartValueField<T> = {
  status: SmartFieldStatus;
  value: T | null;
  message: string;
};

export type SmartPeriod = {
  startDate: string;
  endDate: string;
  precision: "DAY" | "MONTH";
};

export type SmartInputPreview = {
  target: SmartInputTarget;
  input: string;
  confidence: number;
  canApply: boolean;
  warnings: string[];
  options: {
    sites: SmartMasterOption[];
    items: SmartMasterOption[];
  };
  fields: {
    site: SmartMasterField;
    item: SmartMasterField;
    quantity: SmartValueField<number> & { unit: string | null };
    unitPrice: SmartValueField<number>;
    totalAmount: SmartValueField<number>;
    period: SmartValueField<SmartPeriod>;
    title: SmartValueField<string>;
    priceOverrideReason: SmartValueField<string>;
  };
};

export type SmartInputAppliedDraft = {
  siteId: string;
  itemId: string | null;
  title: string;
  description: string;
  quantity: number | null;
  unit: string;
  appliedSalesPrice: number | null;
  appliedCostPrice: number | null;
  salesAmount: number;
  priceOverrideReason: string;
  startDate: string;
  endDate: string;
  revenueDate: string;
};
