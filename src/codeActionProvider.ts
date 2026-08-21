import * as vscode from "vscode";
import { ExtensionConfig } from "./config";
import { ParsedTheme } from "./cssThemeParser";
import { scanForBurnedColors } from "./colorScanner";
import { rankSuggestions } from "./colorDistance";
import { BURNED_COLOR_CODE, DIAGNOSTIC_SOURCE } from "./diagnostics";
import { FIX_ALL_IN_FILE_COMMAND } from "./fixAllCommands";

export class BurnedColorCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.SourceFixAll,
  ];

  constructor(
    private readonly getConfig: () => ExtensionConfig,
    private readonly getTheme: () => ParsedTheme
  ) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const config = this.getConfig();
    const theme = this.getTheme();
    const actions: vscode.CodeAction[] = [];

    const hasBurnedColorDiagnostic = context.diagnostics.some(
      (d) => d.source === DIAGNOSTIC_SOURCE && d.code === BURNED_COLOR_CODE
    );
    if (context.only?.contains(vscode.CodeActionKind.SourceFixAll) && hasBurnedColorDiagnostic) {
      const fixAll = new vscode.CodeAction(
        "Tailwind Strict Colors: reemplazar todos los colores quemados (archivo)",
        vscode.CodeActionKind.SourceFixAll
      );
      fixAll.command = { command: FIX_ALL_IN_FILE_COMMAND, title: "Fix All Burned Colors" };
      return [fixAll];
    }

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== DIAGNOSTIC_SOURCE || diagnostic.code !== BURNED_COLOR_CODE) continue;

      const originalText = document.getText(diagnostic.range);
      const [match] = scanForBurnedColors(
        originalText,
        { utilities: config.utilities, ignoredColorNames: config.ignoredColorNames },
        theme
      );
      if (!match) continue;

      const suggestions = rankSuggestions(match, theme.tokens, config.maxSuggestions);
      if (suggestions.length === 0) continue;

      for (const suggestion of suggestions) {
        const action = new vscode.CodeAction(
          `Tailwind Strict Colors: reemplazar por "${suggestion.replacementClass}"`,
          vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diagnostic];
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, diagnostic.range, suggestion.replacementClass);
        actions.push(action);
      }
    }

    return actions;
  }
}
