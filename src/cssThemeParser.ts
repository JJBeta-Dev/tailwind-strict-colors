export interface ThemeToken {
  /** Token name without the `--color-` prefix, e.g. "brand-primary". */
  name: string;
  /** Raw declared value, e.g. "oklch(0.6 0.2 25)" or "var(--brand-500)". */
  rawValue: string;
  /** Resolved hex color, when it could be determined (hex/rgb/var chains only). */
  resolvedHex?: string;
}

export interface ParsedTheme {
  /** name -> token, includes every `--color-*` declared inside @theme blocks. */
  tokens: Map<string, ThemeToken>;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Finds the substring of every top-level `@theme { ... }` (or `@theme inline { ... }`) block. */
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

function resolveValue(
  rawValue: string,
  rawDeclarations: Map<string, string>,
  depth = 0
): string | undefined {
  const value = rawValue.trim();
  if (depth > 5) return undefined;

  const hexMatch = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) return normalizeHex(value);

  const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return normalizeHex(
      `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`
    );
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
