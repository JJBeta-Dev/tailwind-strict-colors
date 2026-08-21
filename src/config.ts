import * as vscode from "vscode";

/**
 * Resolved `tailwindStrictColors.*` settings, as consumed by every other
 * module in the extension. See `package.json`'s
 * `contributes.configuration.properties` for user-facing descriptions and
 * defaults of each field.
 */
export interface ExtensionConfig {
  enable: boolean;
  themeFileGlob: string;
  languages: string[];
  utilities: string[];
  ignoredColorNames: string[];
  maxSuggestions: number;
}

const SECTION = "tailwindStrictColors";

/**
 * Reads the current `tailwindStrictColors.*` settings from VS Code.
 * Cheap enough to call on demand — callers typically pass `() => readConfig()`
 * around instead of caching the result, so config changes are always picked
 * up on the next read.
 *
 * @returns The resolved extension configuration.
 * @example
 * ```ts
 * const config = readConfig();
 * if (config.enable) {
 *   // scan documents using config.utilities, config.languages, etc.
 * }
 * ```
 */
export function readConfig(): ExtensionConfig {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    enable: cfg.get<boolean>("enable", true),
    themeFileGlob: cfg.get<string>("themeFileGlob", "**/index.css"),
    languages: cfg.get<string[]>("languages", []),
    utilities: cfg.get<string[]>("utilities", []),
    ignoredColorNames: cfg.get<string[]>("ignoredColorNames", []),
    maxSuggestions: cfg.get<number>("maxSuggestions", 5),
  };
}

/**
 * Subscribes to changes in any `tailwindStrictColors.*` setting, ignoring
 * unrelated configuration changes elsewhere in the user's settings.
 *
 * @param listener - Called (with no arguments) whenever a relevant setting changes.
 * @returns A disposable that unsubscribes the listener.
 * @example
 * ```ts
 * context.subscriptions.push(onConfigChanged(() => rescanAllOpenDocuments()));
 * ```
 */
export function onConfigChanged(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(SECTION)) listener();
  });
}
