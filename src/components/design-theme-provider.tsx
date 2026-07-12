"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  DESIGN_THEME_ATTRIBUTE,
  DESIGN_THEME_STORAGE_KEY,
  normalizeDesignTheme,
  type DesignTheme,
} from "@/lib/design-theme";

type DesignThemeContextValue = {
  designTheme: DesignTheme | undefined;
  setDesignTheme: (theme: DesignTheme) => void;
};

const DesignThemeContext = createContext<DesignThemeContextValue | null>(null);
const DESIGN_THEME_CHANGE_EVENT = "smart-construction-design-theme-change";

export function DesignThemeProvider({ children }: { children: React.ReactNode }) {
  const designTheme = useSyncExternalStore(
    subscribeToDesignTheme,
    readAppliedDesignTheme,
    readServerDesignTheme,
  );

  const setDesignTheme = useCallback((theme: DesignTheme) => {
    applyDesignTheme(theme);

    try {
      localStorage.setItem(DESIGN_THEME_STORAGE_KEY, theme);
    } catch {
      // The visual preference still applies for this page when storage is unavailable.
    }
    window.dispatchEvent(new Event(DESIGN_THEME_CHANGE_EVENT));
  }, []);

  const value = useMemo(
    () => ({ designTheme, setDesignTheme }),
    [designTheme, setDesignTheme],
  );

  return <DesignThemeContext.Provider value={value}>{children}</DesignThemeContext.Provider>;
}

export function useDesignTheme() {
  const context = useContext(DesignThemeContext);
  if (!context) throw new Error("useDesignTheme must be used within DesignThemeProvider");
  return context;
}

function readAppliedDesignTheme(): DesignTheme {
  return normalizeDesignTheme(document.documentElement.getAttribute(DESIGN_THEME_ATTRIBUTE));
}

function readServerDesignTheme(): undefined {
  return undefined;
}

function subscribeToDesignTheme(onStoreChange: () => void) {
  function syncStoredTheme(event: StorageEvent) {
    if (event.key !== DESIGN_THEME_STORAGE_KEY) return;
    applyDesignTheme(normalizeDesignTheme(event.newValue));
    onStoreChange();
  }

  window.addEventListener("storage", syncStoredTheme);
  window.addEventListener(DESIGN_THEME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", syncStoredTheme);
    window.removeEventListener(DESIGN_THEME_CHANGE_EVENT, onStoreChange);
  };
}

function applyDesignTheme(theme: DesignTheme) {
  if (theme === "sagwa") {
    document.documentElement.setAttribute(DESIGN_THEME_ATTRIBUTE, theme);
    return;
  }

  document.documentElement.removeAttribute(DESIGN_THEME_ATTRIBUTE);
}
