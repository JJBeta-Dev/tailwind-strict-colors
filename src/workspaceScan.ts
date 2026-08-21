import * as vscode from "vscode";
import { ExtensionConfig } from "./config";
import { ParsedTheme } from "./cssThemeParser";
import { BurnedColorMatch, scanForBurnedColors } from "./colorScanner";
import { looksGenerated } from "./generatedFileHeuristic";

/** Maps a VS Code language id to the file extensions used for workspace-wide glob search. */
export const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  javascript: ["js", "mjs", "cjs"],
  javascriptreact: ["jsx"],
  typescript: ["ts"],
  typescriptreact: ["tsx"],
  html: ["html"],
  vue: ["vue"],
  svelte: ["svelte"],
  astro: ["astro"],
};

/**
 * Finds every file in the workspace whose extension matches one of the
 * configured `languages`, excluding common build-output directories.
 * Shared by `fixAllCommands.ts` and `problemsWebviewProvider.ts` so both
 * stay in sync on which files count as "in scope".
 *
 * @param languages - VS Code language ids from `tailwindStrictColors.languages`.
 * @returns Matching file URIs across all workspace folders.
 * @example
 * ```ts
 * const files = await findScannableFiles(["typescriptreact", "javascriptreact"]);
 * ```
 */
export async function findScannableFiles(languages: string[]): Promise<vscode.Uri[]> {
  const extensions = [...new Set(languages.flatMap((lang) => LANGUAGE_EXTENSIONS[lang] ?? []))];
  if (extensions.length === 0) return [];

  return vscode.workspace.findFiles(
    `**/*.{${extensions.join(",")}}`,
    "**/{node_modules,dist,build,out,.next,.nuxt,.output,.turbo,.svelte-kit,.vercel,coverage,storybook-static,.git}/**"
  );
}

/** A file that contains at least one burned color, with its matches ready to render/fix. */
export interface FileScanResult {
  uri: vscode.Uri;
  document: vscode.TextDocument;
  matches: BurnedColorMatch[];
}

/**
 * Scans every file matching the configured languages and returns only the
 * ones with burned colors. Generated/minified files (see
 * `generatedFileHeuristic.ts`) are skipped even if their extension matches.
 *
 * @param config - The extension's current configuration.
 * @param theme - The project's parsed `@theme`.
 * @returns One {@link FileScanResult} per file that has at least one match.
 * @example
 * ```ts
 * const results = await scanWorkspace(readConfig(), themeWatcher.getTheme());
 * const totalIssues = results.reduce((sum, r) => sum + r.matches.length, 0);
 * ```
 */
export async function scanWorkspace(config: ExtensionConfig, theme: ParsedTheme): Promise<FileScanResult[]> {
  const files = await findScannableFiles(config.languages);
  const scanOptions = { utilities: config.utilities, ignoredColorNames: config.ignoredColorNames };
  const results: FileScanResult[] = [];

  for (const uri of files) {
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    if (looksGenerated(text)) continue;

    const matches = scanForBurnedColors(text, scanOptions, theme);
    if (matches.length > 0) results.push({ uri, document, matches });
  }

  return results;
}
