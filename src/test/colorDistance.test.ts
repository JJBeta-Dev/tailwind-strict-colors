import { test } from "node:test";
import assert from "node:assert/strict";
import { rankSuggestions } from "../colorDistance";
import { BurnedColorMatch } from "../colorScanner";
import { ThemeToken } from "../cssThemeParser";

function tokens(entries: Array<[string, Partial<ThemeToken>]>): Map<string, ThemeToken> {
  const map = new Map<string, ThemeToken>();
  for (const [name, partial] of entries) {
    map.set(name, { name, rawValue: partial.resolvedHex ?? "", ...partial });
  }
  return map;
}

test("ranks the closest resolved hex color first", () => {
  const match: BurnedColorMatch = {
    start: 0, end: 0, text: "bg-red-500", utility: "bg", kind: "chromatic", family: "red", shade: "500",
  };
  const themeTokens = tokens([
    ["brand-far", { resolvedHex: "#00ff00" }],
    ["brand-close", { resolvedHex: "#ef4444" }], // exact red-500
  ]);

  const suggestions = rankSuggestions(match, themeTokens, 5);
  assert.equal(suggestions[0].tokenName, "brand-close");
  assert.equal(suggestions[0].replacementClass, "bg-brand-close");
});

test("falls back to semantic synonyms when no hex can be resolved", () => {
  const match: BurnedColorMatch = {
    start: 0, end: 0, text: "bg-red-500", utility: "bg", kind: "chromatic", family: "red", shade: "500",
  };
  const themeTokens = tokens([
    ["brand-neutral", {}],
    ["brand-danger", {}],
  ]);

  const suggestions = rankSuggestions(match, themeTokens, 5);
  assert.equal(suggestions[0].tokenName, "brand-danger");
});

test("respects maxSuggestions", () => {
  const match: BurnedColorMatch = {
    start: 0, end: 0, text: "text-blue-500", utility: "text", kind: "chromatic", family: "blue", shade: "500",
  };
  const themeTokens = tokens([
    ["a", {}], ["b", {}], ["c", {}], ["d", {}],
  ]);

  const suggestions = rankSuggestions(match, themeTokens, 2);
  assert.equal(suggestions.length, 2);
});
