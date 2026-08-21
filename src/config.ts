import * as vscode from "vscode";

export interface ExtensionConfig {
  enable: boolean;
  themeFileGlob: string;
  languages: string[];
  utilities: string[];
  ignoredColorNames: string[];
  maxSuggestions: number;
}

const SECTION = "tailwindStrictColors";

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

export function onConfigChanged(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(SECTION)) listener();
  });
}
