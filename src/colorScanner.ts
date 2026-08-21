import {
  CHROMATIC_FAMILIES,
  BARE_COLOR_KEYWORDS,
  ChromaticFamily,
  BareColorKeyword,
  isChromaticFamily,
  isBareColorKeyword,
} from "./tailwindPalette";
import { ParsedTheme } from "./cssThemeParser";

/** A single occurrence of a default-palette Tailwind color found in a document. */
export interface BurnedColorMatch {
  /** Offset in the source text where the full class (utility-color[-shade]) starts. */
  start: number;
  /** Offset where it ends (exclusive). */
  end: number;
  /** Full matched text, e.g. "bg-red-500". */
  text: string;
  /** Tailwind utility prefix, e.g. `"bg"`, `"text"`, `"ring-offset"`. */
  utility: string;
  /** Whether the color is a shaded family (`chromatic`) or a bare keyword like `white` (`bare`). */
  kind: "chromatic" | "bare";
  /** The matched family (chromatic) or keyword (bare). */
  family: ChromaticFamily | BareColorKeyword;
  /** Shade, present only when `kind === "chromatic"`. */
  shade?: string;
}

/** Options controlling how {@link scanForBurnedColors} looks for matches. */
export interface ScanOptions {
  /** Tailwind utility prefixes to inspect, e.g. `["bg", "text", "border"]`. */
  utilities: string[];
  /** Bare color keywords (no shade) that should never be reported. */
  ignoredColorNames: string[];
}

/** Escapes regex metacharacters so a utility name can be used literally inside a pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds the regex that finds `<utility>-<chromaticFamily>-<shade>` or
 * `<utility>-<bareKeyword>` occurrences. Utilities are sorted longest-first
 * so a multi-word one (e.g. `ring-offset`) is tried before its shorter
 * prefix (`ring`) — regex backtracking would find it either way, but this
 * keeps matching deterministic and slightly faster.
 */
function buildRegex(utilities: string[]): RegExp {
  const utilityAlt = [...utilities]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const chromaticAlt = CHROMATIC_FAMILIES.join("|");
  const bareAlt = BARE_COLOR_KEYWORDS.join("|");
  const shadeAlt = "50|100|200|300|400|500|600|700|800|900|950";

  return new RegExp(`\\b(${utilityAlt})-(?:(${chromaticAlt})-(${shadeAlt})|(${bareAlt}))\\b`, "g");
}

/**
 * Scans `text` for Tailwind utility classes that use a color from the default
 * palette (e.g. `bg-red-500`, `text-white`) instead of a project theme token.
 * A match is only "burned" if the exact resulting token name is NOT declared
 * in the user's own `@theme` (an explicit override is treated as intentional).
 *
 * @param text - Raw document text to scan (works on any language — it is a
 * text-level regex scan, not an AST parse, so it matches inside
 * `className`, `class`, `clsx()`, `cva()`, etc. equally).
 * @param options - Which utilities to look for and which bare keywords to ignore.
 * @param theme - The project's parsed `@theme`, used to skip intentional overrides.
 * @returns Every burned color occurrence found, in source order.
 * @example
 * ```ts
 * const theme = parseTheme(["@theme { --color-brand-primary: #2563eb; }"]);
 * scanForBurnedColors(
 *   '<div className="bg-red-500 bg-brand-primary" />',
 *   { utilities: ["bg"], ignoredColorNames: ["white", "black"] },
 *   theme
 * );
 * // [{ text: "bg-red-500", kind: "chromatic", family: "red", shade: "500", ... }]
 * ```
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
