import * as vscode from "vscode";
import { ExtensionConfig } from "./config";
import { ParsedTheme } from "./cssThemeParser";
import { scanForBurnedColors } from "./colorScanner";

/** `Diagnostic.source` value used for every diagnostic this extension raises. */
export const DIAGNOSTIC_SOURCE = "tailwind-strict-colors";
/** `Diagnostic.code` used to identify a burned-color diagnostic (matched by {@link BurnedColorCodeActionProvider}). */
export const BURNED_COLOR_CODE = "burned-color";

/**
 * Owns the single `DiagnosticCollection` this extension contributes and
 * keeps it in sync with one document at a time. One instance is shared for
 * the whole extension lifetime — see `extension.ts`.
 */
export class DiagnosticsManager implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  }

  /**
   * Re-scans `document` and replaces its diagnostics. Clears them entirely
   * if the extension is disabled or the document's language isn't configured.
   *
   * @param document - The document to (re)scan.
   * @param config - Current extension configuration.
   * @param theme - The project's parsed `@theme`.
   * @example
   * ```ts
   * diagnostics.updateDocument(editor.document, readConfig(), themeWatcher.getTheme());
   * ```
   */
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
      const range = new vscode.Range(document.positionAt(match.start), document.positionAt(match.end));
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

  /** Removes all diagnostics for `uri`, e.g. once its editor tab is closed. */
  clearDocument(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
