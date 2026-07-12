import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("theme contract", () => {
  it("uses the system theme by default without transition flashes", () => {
    const providers = source("src/components/providers.tsx");
    const layout = source("src/app/layout.tsx");

    expect(providers).toContain('defaultTheme="system"');
    expect(providers).toContain("disableTransitionOnChange");
    expect(providers).toContain("<DesignThemeProvider>");
    expect(layout).toContain("DESIGN_THEME_BOOTSTRAP_SCRIPT");
  });

  it("exposes a persistent two-axis appearance control on every entry surface", () => {
    const shell = source("src/components/app-shell.tsx");
    const login = source("src/app/(auth)/login/page.tsx");
    const setup = source("src/app/(auth)/setup/page.tsx");
    const toggle = source("src/components/theme-toggle.tsx");

    expect(shell).toContain("<ThemeToggle");
    expect(login).toContain("<ThemeToggle");
    expect(setup).toContain("<ThemeToggle");
    expect(toggle).toContain("useDesignTheme");
    expect(toggle).toContain("기본 테마");
    expect(toggle).toContain("사과테마");
    expect(toggle).toContain('setDesignTheme("default")');
    expect(toggle).toContain('setDesignTheme("sagwa")');
    expect(toggle).toContain("setTheme");
    expect(toggle).toContain('setTheme("system")');
    expect(toggle).toContain('setTheme("light")');
    expect(toggle).toContain('setTheme("dark")');
    expect(toggle).not.toContain("Apple");
  });

  it("defines sagwa light and dark surfaces without changing invoice paper styles", () => {
    const css = source("src/app/globals.css");
    const shell = source("src/components/app-shell.tsx");
    const login = source("src/app/(auth)/login/page.tsx");
    const setup = source("src/app/(auth)/setup/page.tsx");
    const dashboard = source("src/app/(main)/page.tsx");

    expect(css).toContain('html[data-design-theme="sagwa"]');
    expect(css).toContain('html.dark[data-design-theme="sagwa"]');
    expect(css).toContain("prefers-reduced-transparency: reduce");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-contrast: more");
    expect(css).toContain(".invoice-page");
    expect(css).toContain("background: white;");
    expect(css).toContain("color: #111827;");
    expect(shell).toContain("app-header");
    expect(shell).toContain("app-sidebar");
    expect(login).toContain("auth-frame");
    expect(setup).toContain("auth-frame");
    expect(dashboard).toContain("dashboard-hero");
  });
});
