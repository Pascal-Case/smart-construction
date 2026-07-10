export type LegacyItem = {
  id: string;
  name: string;
  salesPrice: number;
  costPrice: number;
  unit: string;
};

export type LegacyContract = {
  id: string;
  site: string;
  itemId: string;
  quantity: number;
  startDate: string;
  endDate: string;
};

export type LegacySupplier = {
  businessRegistrationNo: string;
  companyName: string;
  representativeName: string;
  address: string;
  businessType: string;
  businessItem: string;
  phone: string;
};

export type LegacyMigrationBundle = {
  format: "smart-construction-legacy-v1";
  exportedAt: string | null;
  sourceType: "LOCAL_STORAGE" | "EXCEL";
  sourceName: string | null;
  items: LegacyItem[];
  contracts: LegacyContract[];
  supplier: LegacySupplier | null;
};

export type MigrationIssue = {
  severity: "ERROR" | "WARNING";
  kind: "FILE" | "ITEM" | "SITE" | "CONTRACT" | "SUPPLIER";
  rowKey: string;
  message: string;
};

export type MigrationAction = "CREATE" | "REUSE" | "UPDATE" | "SKIP" | "ERROR";

export type MigrationPreviewRow = {
  kind: "ITEM" | "SITE" | "CONTRACT" | "SUPPLIER";
  rowKey: string;
  label: string;
  action: MigrationAction;
  message: string;
  targetId: string | null;
};

export type LegacyMigrationPreview = {
  fingerprint: string;
  canCommit: boolean;
  alreadyCommitted: boolean;
  normalizedBundle: LegacyMigrationBundle;
  issues: MigrationIssue[];
  rows: MigrationPreviewRow[];
  summary: {
    totalItems: number;
    totalSites: number;
    totalContracts: number;
    createdItems: number;
    reusedItems: number;
    createdSites: number;
    reusedSites: number;
    createdContracts: number;
    skippedContracts: number;
    errorCount: number;
    warningCount: number;
  };
};

export type LegacyMigrationHistory = {
  id: string;
  fingerprint: string;
  sourceType: string;
  sourceName: string | null;
  totalItems: number;
  totalSites: number;
  totalContracts: number;
  createdContracts: number;
  warningCount: number;
  actorName: string;
  createdAt: string;
};
