import * as vscode from "vscode";
import { ExtensionConfig } from "./config";
import { ParsedTheme } from "./cssThemeParser";
import { scanForBurnedColors } from "./colorScanner";

export const DIAGNOSTIC_SOURCE = "tailwind-strict-colors";
export const BURNED_COLOR_CODE = "burned-color";

export class DiagnosticsManager implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  }

  updateDocument(document: vscode.TextDocument, config: ExtensionConfig, theme: ParsedTheme): void {
    if (!config.enable || !config.languages.includes(document.languageId)) {
      this.collection.delete(document.uri);
      return;
    }

    const text = document.getText();
    const matches = scanForBurnedColors(
      text,
      { utilities: config.utilities, ignoredColorNames: config.ignoredColorNames },
      theme
    );

    const diagnostics = matches.map((match) => {
      const range = new vscode.Range(
        document.positionAt(match.start),
        document.positionAt(match.end)
      );
      const diagnostic = new vscode.Diagnostic(
        range,
        `Color quemado de Tailwind: "${match.text}". Usa un token de tu @theme (${config.themeFileGlob}) en su lugar.`,
        vscode.DiagnosticSeverity.Warning
      );
      diagnostic.source = DIAGNOSTIC_SOURCE;
      diagnostic.code = BURNED_COLOR_CODE;
      return diagnostic;
    });

    this.collection.set(document.uri, diagnostics);
  }

  clearDocument(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
