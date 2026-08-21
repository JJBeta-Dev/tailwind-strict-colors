import { test } from "node:test";
import assert from "node:assert/strict";
import { scanForBurnedColors } from "../colorScanner";
import { parseTheme } from "../cssThemeParser";

const DEFAULT_OPTIONS = {
  utilities: ["bg", "text", "border", "ring", "ring-offset"],
  ignoredColorNames: ["inherit", "current", "transparent", "black", "white"],
};

const EMPTY_THEME = parseTheme([]);

test("flags a default-palette color class", () => {
  const matches = scanForBurnedColors('<div className="bg-red-500" />', DEFAULT_OPTIONS, EMPTY_THEME);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].text, "bg-red-500");
  assert.equal(matches[0].kind, "chromatic");
});

test("does not flag a custom token name", () => {
  const matches = scanForBurnedColors('<div className="bg-brand-primary" />', DEFAULT_OPTIONS, EMPTY_THEME);
  assert.equal(matches.length, 0);
});

test("does not flag when the exact default token was intentionally redefined", () => {
  const theme = parseTheme(["@theme { --color-red-500: #123456; }"]);
  const matches = scanForBurnedColors('<div className="bg-red-500" />', DEFAULT_OPTIONS, theme);
  assert.equal(matches.length, 0);
});

test("respects the utilities list (only configured prefixes are scanned)", () => {
  const matches = scanForBurnedColors(
    '<div className="fill-red-500" />',
    { ...DEFAULT_OPTIONS, utilities: ["bg", "text"] },
    EMPTY_THEME
  );
  assert.equal(matches.length, 0);
});

test("handles variant prefixes like hover: and dark:", () => {
  const matches = scanForBurnedColors(
    '<div className="hover:bg-red-500 dark:text-gray-200" />',
    DEFAULT_OPTIONS,
    EMPTY_THEME
  );
  assert.equal(matches.length, 2);
});

test("bare keywords are ignored by default (white/black) unless removed from ignore list", () => {
  const matches = scanForBurnedColors('<div className="bg-white" />', DEFAULT_OPTIONS, EMPTY_THEME);
  assert.equal(matches.length, 0);

  const strict = scanForBurnedColors(
    '<div className="bg-white" />',
    { ...DEFAULT_OPTIONS, ignoredColorNames: [] },
    EMPTY_THEME
  );
  assert.equal(strict.length, 1);
  assert.equal(strict[0].kind, "bare");
});

test("multi-word utilities like ring-offset are matched over their shorter prefix", () => {
  const matches = scanForBurnedColors(
    '<div className="ring-offset-blue-500" />',
    DEFAULT_OPTIONS,
    EMPTY_THEME
  );
  assert.equal(matches.length, 1);
  assert.equal(matches[0].utility, "ring-offset");
});

test("non-color utilities with numeric suffixes are not false positives", () => {
  const matches = scanForBurnedColors(
    '<div className="border-2 text-lg text-center" />',
    DEFAULT_OPTIONS,
    EMPTY_THEME
  );
  assert.equal(matches.length, 0);
});
