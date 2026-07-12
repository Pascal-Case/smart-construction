export const DESIGN_THEME_ATTRIBUTE = "data-design-theme";
export const DESIGN_THEME_STORAGE_KEY = "smart-construction-design-theme";
export const DESIGN_THEMES = ["default", "sagwa"] as const;

export type DesignTheme = (typeof DESIGN_THEMES)[number];

export function normalizeDesignTheme(value: unknown): DesignTheme {
  return value === "sagwa" ? "sagwa" : "default";
}

export const DESIGN_THEME_BOOTSTRAP_SCRIPT = `(function(){try{var value=localStorage.getItem(${JSON.stringify(DESIGN_THEME_STORAGE_KEY)});var root=document.documentElement;if(value==="sagwa")root.setAttribute(${JSON.stringify(DESIGN_THEME_ATTRIBUTE)},"sagwa");else root.removeAttribute(${JSON.stringify(DESIGN_THEME_ATTRIBUTE)});}catch(error){}})();`;
