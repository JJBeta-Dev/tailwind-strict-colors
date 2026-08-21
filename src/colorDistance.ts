import { BurnedColorMatch } from "./colorScanner";
import { ThemeToken } from "./cssThemeParser";
import {
  FAMILY_SYNONYMS,
  hexForBareKeyword,
  hexForShade,
  isChromaticFamily,
} from "./tailwindPalette";

export interface Suggestion {
  tokenName: string;
  /** Replacement class, e.g. "bg-brand-danger". */
  replacementClass: string;
}

function hexToRgb(hex: string): [number, number, number] | undefined {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return undefined;
  const num = Number.parseInt(clean, 16);
  if (Number.isNaN(num)) return undefined;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Low-cost perceptual-ish distance (redmean approximation). Good enough for ranking. */
function colorDistance(hexA: string, hexB: string): number | undefined {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return undefined;

  const [r1, g1, b1] = rgbA;
  const [r2, g2, b2] = rgbB;
  const redMean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;

  return Math.sqrt(
    (2 + redMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - redMean) / 256) * db * db
  );
}

function burnedHex(match: BurnedColorMatch): string | undefined {
  if (match.kind === "chromatic" && isChromaticFamily(match.family) && match.shade) {
    return hexForShade(match.family, match.shade as never);
  }
  if (match.kind === "bare") {
    return hexForBareKeyword(match.family as never);
  }
  return undefined;
}

function synonymScore(tokenName: string, match: BurnedColorMatch): number {
  if (match.kind !== "chromatic") return 0;
  const synonyms = FAMILY_SYNONYMS[match.family as keyof typeof FAMILY_SYNONYMS] ?? [];
  const lowerName = tokenName.toLowerCase();
  return synonyms.reduce((score, word) => (lowerName.includes(word) ? score + 1 : score), 0);
}

/**
 * Ranks the user's theme tokens as replacement candidates for a burned color.
 * Prefers actual color distance when both sides resolve to a hex value;
 * falls back to semantic name matching (danger/warning/success/...) otherwise.
 */
export function rankSuggestions(
  match: BurnedColorMatch,
  tokens: Map<string, ThemeToken>,
  maxSuggestions: number
): Suggestion[] {
  const target = burnedHex(match);
  const candidates = [...tokens.values()];

  const scored = candidates.map((token) => {
    const distance =
      target && token.resolvedHex ? colorDistance(target, token.resolvedHex) : undefined;
    return { token, distance, synonyms: synonymScore(token.name, match) };
  });

  scored.sort((a, b) => {
    if (a.distance !== undefined && b.distance !== undefined) return a.distance - b.distance;
    if (a.distance !== undefined) return -1;
    if (b.distance !== undefined) return 1;
    if (a.synonyms !== b.synonyms) return b.synonyms - a.synonyms;
    return a.token.name.localeCompare(b.token.name);
  });

  return scored.slice(0, maxSuggestions).map(({ token }) => ({
    tokenName: token.name,
    replacementClass: `${match.utility}-${token.name}`,
  }));
}
