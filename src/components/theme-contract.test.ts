import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(file: string) {
  return readFileSync(path.join(process.cwd(), file), "utf8");
}

describe("theme contract", () => {
  it("uses the system theme by default without transition flashes", () => {
    const providers = source("src/components/providers.tsx");

    expect(providers).toContain('defaultTheme="system"');
    expect(providers).toContain("disableTransitionOnChange");
  });

  it("exposes a persistent light and dark mode toggle in the app shell", () => {
    const shell = source("src/components/app-shell.tsx");
    const login = source("src/app/(auth)/login/page.tsx");
    const setup = source("src/app/(auth)/setup/page.tsx");
    const toggle = source("src/components/theme-toggle.tsx");

    expect(shell).toContain("<ThemeToggle");
    expect(login).toContain("<ThemeToggle");
    expect(setup).toContain("<ThemeToggle");
    expect(toggle).toContain("setTheme");
    expect(toggle).toContain('resolvedTheme === "dark" ? "light" : "dark"');
  });
});
