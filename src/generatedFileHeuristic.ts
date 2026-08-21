const MIN_LENGTH_TO_CONSIDER = 2000;
const MIN_AVERAGE_LINE_LENGTH = 300;

/**
 * Heuristic to skip bundled/minified build output (e.g. Vite's
 * `dist/assets/index-<hash>.js`) from the workspace-wide scan: authored
 * JSX/TSX/Vue/Svelte source is never this dense, regardless of which
 * directory it happens to live in.
 */
export function looksGenerated(text: string): boolean {
  if (text.length < MIN_LENGTH_TO_CONSIDER) return false;
  const lines = text.split("\n");
  const averageLineLength = text.length / lines.length;
  return averageLineLength > MIN_AVERAGE_LINE_LENGTH;
}
