/** A single `--color-*` custom property declared inside a project's `@theme`. */
export interface ThemeToken {
  /** Token name without the `--color-` prefix, e.g. "brand-primary". */
  name: string;
  /** Raw declared value, e.g. "oklch(0.6 0.2 25)" or "var(--brand-500)". */
  rawValue: string;
  /** Resolved hex color, when it could be determined (hex/rgb/var chains only). */
  resolvedHex?: string;
}

/** Result of parsing a project's CSS for `@theme` color tokens. */
export interface ParsedTheme {
  /** Token name mapped to its token, one entry per `--color-*` declared inside `\@theme` blocks. */
  tokens: Map<string, ThemeToken>;
}

/** Strips `/* ... *\/` CSS comments so they can't be mistaken for real declarations. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Finds the substring of every top-level `@theme { ... }` (or
 * `@theme inline { ... }`) block, matching braces by hand so nested rules
 * (e.g. a media query inside the theme block) don't confuse a naive regex.
 */
function extractThemeBlocks(css: string): string[] {
  const blocks: string[] = [];
  const atRuleRegex = /@theme\b[^{]*\{/g;
  let match: RegExpExecArray | null;

  while ((match = atRuleRegex.exec(css))) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    blocks.push(css.slice(start, i - 1));
    atRuleRegex.lastIndex = i;
  }

  return blocks;
}

/**
 * Attempts to resolve a CSS custom property value down to a hex color,
 * following `var()` references up to 5 levels deep. Returns `undefined` for
 * anything else (`oklch()`, `hsl()`, `color-mix()`, ...) — those are
 * intentionally out of scope; see `colorDistance.ts` for the semantic
 * fallback used when a token has no resolved hex.
 */
function resolveValue(rawValue: string, rawDeclarations: Map<string, string>, depth = 0): string | undefined {
  const value = rawValue.trim();
  if (depth > 5) return undefined;

  const hexMatch = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) return normalizeHex(value);

  const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return normalizeHex(`#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`);
  }

  const varMatch = value.match(/^var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)$/);
  if (varMatch) {
    const [, refName, fallback] = varMatch;
    const refValue = rawDeclarations.get(refName);
    if (refValue !== undefined) return resolveValue(refValue, rawDeclarations, depth + 1);
    if (fallback !== undefined) return resolveValue(fallback, rawDeclarations, depth + 1);
    return undefined;
  }

  // oklch(), hsl(), color-mix(), etc. are intentionally not resolved (v1 scope).
  return undefined;
}

/** Lowercases a hex color and expands the 3-digit shorthand form (e.g. `#f0a` becomes `#ff00aa`). */
function normalizeHex(hex: string): string {
  if (hex.length === 4) {
    const [, r, g, b] = hex;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return hex.toLowerCase();
}

/**
 * Parses one or more CSS source strings for `@theme` blocks and returns every
 * `--color-*` custom property declared inside them, resolved to a hex color
 * where possible.
 *
 * @param cssSources - Raw contents of one or more CSS files (e.g. every file
 * matched by `tailwindStrictColors.themeFileGlob` across a workspace).
 * @returns The combined set of theme tokens declared across all sources.
 * @example
 * ```ts
 * const { tokens } = parseTheme([
 *   "@theme { --color-brand-primary: #2563eb; }",
 * ]);
 * tokens.get("brand-primary")?.resolvedHex; // "#2563eb"
 * ```
 */
export function parseTheme(cssSources: string[]): ParsedTheme {
  const tokens = new Map<string, ThemeToken>();
  const rawDeclarations = new Map<string, string>();
  const colorDeclarations: Array<{ name: string; rawValue: string }> = [];

  for (const source of cssSources) {
    const css = stripComments(source);
    for (const block of extractThemeBlocks(css)) {
      const declRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
      let decl: RegExpExecArray | null;
      while ((decl = declRegex.exec(block))) {
        const [, propName, rawValue] = decl;
        rawDeclarations.set(propName, rawValue.trim());
        if (propName.startsWith("--color-")) {
          colorDeclarations.push({ name: propName.slice("--color-".length), rawValue: rawValue.trim() });
        }
      }
    }
  }

  for (const { name, rawValue } of colorDeclarations) {
    tokens.set(name, {
      name,
      rawValue,
      resolvedHex: resolveValue(rawValue, rawDeclarations),
    });
  }

  return { tokens };
}
