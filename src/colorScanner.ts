import {
  CHROMATIC_FAMILIES,
  BARE_COLOR_KEYWORDS,
  ChromaticFamily,
  BareColorKeyword,
  isChromaticFamily,
  isBareColorKeyword,
} from "./tailwindPalette";
import { ParsedTheme } from "./cssThemeParser";

export interface BurnedColorMatch {
  /** Offset in the source text where the full class (utility-color[-shade]) starts. */
  start: number;
  /** Offset where it ends (exclusive). */
  end: number;
  /** Full matched text, e.g. "bg-red-500". */
  text: string;
  utility: string;
  kind: "chromatic" | "bare";
  family: ChromaticFamily | BareColorKeyword;
  shade?: string;
}

export interface ScanOptions {
  utilities: string[];
  ignoredColorNames: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(utilities: string[]): RegExp {
  const utilityAlt = [...utilities]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const chromaticAlt = CHROMATIC_FAMILIES.join("|");
  const bareAlt = BARE_COLOR_KEYWORDS.join("|");
  const shadeAlt = "50|100|200|300|400|500|600|700|800|900|950";

  return new RegExp(
    `\\b(${utilityAlt})-(?:(${chromaticAlt})-(${shadeAlt})|(${bareAlt}))\\b`,
    "g"
  );
}

/**
 * Scans `text` for Tailwind utility classes that use a color from the default
 * palette (e.g. `bg-red-500`, `text-white`) instead of a project theme token.
 * A match is only "burned" if the exact resulting token name is NOT declared
 * in the user's own `@theme` (an explicit override is treated as intentional).
 */
export function scanForBurnedColors(
  text: string,
  options: ScanOptions,
  theme: ParsedTheme
): BurnedColorMatch[] {
  if (options.utilities.length === 0) return [];

  const regex = buildRegex(options.utilities);
  const ignored = new Set(options.ignoredColorNames.map((n) => n.toLowerCase()));
  const matches: BurnedColorMatch[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const [full, utility, chromaticFamily, shade, bareKeyword] = match;
    const start = match.index;
    const end = start + full.length;

    if (chromaticFamily && shade && isChromaticFamily(chromaticFamily)) {
      const tokenName = `${chromaticFamily}-${shade}`;
      if (theme.tokens.has(tokenName)) continue; // intentionally redefined
      matches.push({ start, end, text: full, utility, kind: "chromatic", family: chromaticFamily, shade });
      continue;
    }

    if (bareKeyword && isBareColorKeyword(bareKeyword)) {
      if (ignored.has(bareKeyword.toLowerCase())) continue;
      if (theme.tokens.has(bareKeyword)) continue; // intentionally redefined
      matches.push({ start, end, text: full, utility, kind: "bare", family: bareKeyword });
    }
  }

  return matches;
}
