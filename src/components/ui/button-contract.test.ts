import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("Button form contract", () => {
  it("keeps outline button text readable regardless of parent color", () => {
    const source = readFileSync(path.join(process.cwd(), "src/components/ui/button.tsx"), "utf8");
    const outlineVariant = source.match(/outline:\s*\n?\s*"([^"]+)"/)?.[1] ?? "";

    expect(outlineVariant.split(/\s+/)).toContain("text-foreground");
  });

  it("requires every Button inside a form to declare its type", () => {
    const violations: string[] = [];

    for (const file of tsxFiles(path.join(process.cwd(), "src"))) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

      function visit(node: ts.Node, insideForm = false) {
        const nextInsideForm = insideForm || (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "form");
        const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;

        if (nextInsideForm && opening?.tagName.getText(source) === "Button") {
          const type = opening.attributes.properties.find((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "type");
          if (!type) violations.push(`${path.relative(process.cwd(), file)}:${source.getLineAndCharacterOfPosition(opening.getStart(source)).line + 1}`);
        }

        ts.forEachChild(node, (child) => visit(child, nextInsideForm));
      }

      visit(source);
    }

    expect(violations, "폼 내부 Button은 type=submit 또는 type=button을 명시해야 합니다.").toEqual([]);
  });
});

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? tsxFiles(target) : entry.isFile() && entry.name.endsWith(".tsx") ? [target] : [];
  });
}
