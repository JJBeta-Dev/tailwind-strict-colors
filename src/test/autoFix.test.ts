import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAutoFix } from "../autoFix";
import { parseTheme } from "../cssThemeParser";

const OPTIONS = { utilities: ["bg", "text"], ignoredColorNames: ["black", "white", "transparent", "current", "inherit"] };

test("replaces a burned color with the best-ranked token", () => {
  const theme = parseTheme(["@theme { --color-brand-danger: #ef4444; }"]);
  const { replacements, unresolvedCount } = computeAutoFix('bg-red-500', OPTIONS, theme);

  assert.equal(unresolvedCount, 0);
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].replacement, "bg-brand-danger");
  assert.equal(replacements[0].original, "bg-red-500");
});

test("counts as unresolved when there are no theme tokens to suggest", () => {
  const theme = parseTheme([]);
  const { replacements, unresolvedCount } = computeAutoFix('bg-red-500', OPTIONS, theme);

  assert.equal(replacements.length, 0);
  assert.equal(unresolvedCount, 1);
});

test("fixes multiple occurrences in the same text", () => {
  const theme = parseTheme(["@theme { --color-brand-danger: #ef4444; --color-brand-primary: #3b82f6; }"]);
  const { replacements } = computeAutoFix('bg-red-500 text-blue-500', OPTIONS, theme);

  assert.equal(replacements.length, 2);
  assert.equal(replacements[0].replacement, "bg-brand-danger");
  assert.equal(replacements[1].replacement, "text-brand-primary");
});
