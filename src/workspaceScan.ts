import * as vscode from "vscode";
import { ExtensionConfig } from "./config";
import { ParsedTheme } from "./cssThemeParser";
import { BurnedColorMatch, scanForBurnedColors } from "./colorScanner";
import { looksGenerated } from "./generatedFileHeuristic";

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

export async function findScannableFiles(languages: string[]): Promise<vscode.Uri[]> {
  const extensions = [...new Set(languages.flatMap((lang) => LANGUAGE_EXTENSIONS[lang] ?? []))];
  if (extensions.length === 0) return [];

  return vscode.workspace.findFiles(
    `**/*.{${extensions.join(",")}}`,
    "**/{node_modules,dist,build,out,.next,.nuxt,.output,.turbo,.svelte-kit,.vercel,coverage,storybook-static,.git}/**"
  );
}

export interface FileScanResult {
  uri: vscode.Uri;
  document: vscode.TextDocument;
  matches: BurnedColorMatch[];
}

/** Scans every file matching the configured languages and returns only the ones with burned colors. */
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
