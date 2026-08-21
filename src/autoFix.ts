import { scanForBurnedColors, ScanOptions } from "./colorScanner";
import { ParsedTheme } from "./cssThemeParser";
import { rankSuggestions } from "./colorDistance";

/** A single burned-color occurrence paired with its chosen replacement. */
export interface Replacement {
  /** Offset where the original class starts. */
  start: number;
  /** Offset where the original class ends (exclusive). */
  end: number;
  /** The burned class as found in the source, e.g. `"bg-red-500"`. */
  original: string;
  /** The class to replace it with, e.g. `"bg-brand-danger"`. */
  replacement: string;
}

/** Outcome of running Fix All over a piece of text. */
export interface AutoFixResult {
  /** Replacements to apply, in source order. */
  replacements: Replacement[];
  /** Burned colors found but with no theme token available to suggest. */
  unresolvedCount: number;
}

/**
 * Computes the best-guess replacement for every burned color found in `text`.
 * Pure and vscode-free so it can be unit tested directly; the extension layer
 * (`fixAllCommands.ts`) turns the result into a `WorkspaceEdit`.
 *
 * @param text - Document text to fix.
 * @param options - Scan options (utilities to check, keywords to ignore).
 * @param theme - The project's parsed `@theme`, used to rank suggestions.
 * @returns The replacements to apply plus a count of colors left unresolved
 * (no matching token to suggest — surfaced to the user rather than silently dropped).
 * @example
 * ```ts
 * const theme = parseTheme(["@theme { --color-brand-danger: #ef4444; }"]);
 * computeAutoFix("bg-red-500", { utilities: ["bg"], ignoredColorNames: [] }, theme);
 * // { replacements: [{ original: "bg-red-500", replacement: "bg-brand-danger", ... }], unresolvedCount: 0 }
 * ```
 */
export function computeAutoFix(text: string, options: ScanOptions, theme: ParsedTheme): AutoFixResult {
  const matches = scanForBurnedColors(text, options, theme);
  const replacements: Replacement[] = [];
  let unresolvedCount = 0;

  for (const match of matches) {
    const [best] = rankSuggestions(match, theme.tokens, 1);
    if (!best) {
      unresolvedCount++;
      continue;
    }
    replacements.push({
      start: match.start,
      end: match.end,
      original: match.text,
      replacement: best.replacementClass,
    });
  }

  return { replacements, unresolvedCount };
}
