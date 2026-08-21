import { scanForBurnedColors, ScanOptions } from "./colorScanner";
import { ParsedTheme } from "./cssThemeParser";
import { rankSuggestions } from "./colorDistance";

export interface Replacement {
  start: number;
  end: number;
  original: string;
  replacement: string;
}

export interface AutoFixResult {
  replacements: Replacement[];
  /** Burned colors found but with no theme token available to suggest. */
  unresolvedCount: number;
}

/**
 * Computes the best-guess replacement for every burned color found in `text`.
 * Pure and vscode-free so it can be unit tested directly; the extension layer
 * turns the result into a WorkspaceEdit.
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
