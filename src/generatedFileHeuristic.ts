const MIN_LENGTH_TO_CONSIDER = 2000;
const MIN_AVERAGE_LINE_LENGTH = 300;

/**
 * Heuristic to skip bundled/minified build output (e.g. Vite's
 * `dist/assets/index-<hash>.js`) from the workspace-wide scan: authored
 * JSX/TSX/Vue/Svelte source is never this dense, regardless of which
 * directory it happens to live in.
 *
 * @param text - Full document text to evaluate.
 * @returns `true` if the text looks like a minified/generated bundle.
 * @example
 * ```ts
 * looksGenerated("export function Card() {\n  return <div />;\n}\n"); // false
 * looksGenerated("a".repeat(5000) + "\n" + "b".repeat(5000)); // true
 * ```
 */
export function looksGenerated(text: string): boolean {
  if (text.length < MIN_LENGTH_TO_CONSIDER) return false;
  const lines = text.split("\n");
  const averageLineLength = text.length / lines.length;
  return averageLineLength > MIN_AVERAGE_LINE_LENGTH;
}
