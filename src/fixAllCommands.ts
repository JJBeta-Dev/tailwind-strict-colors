import * as vscode from "vscode";
import { ExtensionConfig } from "./config";
import { ParsedTheme } from "./cssThemeParser";
import { computeAutoFix, Replacement } from "./autoFix";
import { findScannableFiles } from "./workspaceScan";

/** Command id: replaces every burned color in the active editor's document. */
export const FIX_ALL_IN_FILE_COMMAND = "tailwindStrictColors.fixAllInFile";
/** Command id: replaces every burned color across all matching files in the workspace. */
export const FIX_ALL_IN_WORKSPACE_COMMAND = "tailwindStrictColors.fixAllInWorkspace";

/** Converts {@link Replacement} offsets into `vscode.TextEdit`s for a specific document. */
function toTextEdits(document: vscode.TextDocument, replacements: Replacement[]): vscode.TextEdit[] {
  return replacements.map((r) =>
    vscode.TextEdit.replace(
      new vscode.Range(document.positionAt(r.start), document.positionAt(r.end)),
      r.replacement
    )
  );
}

/**
 * Warns and returns `true` when the project's `@theme` has no tokens at all
 * — the most common reason Fix All silently has nothing to suggest (the
 * configured glob didn't find the user's CSS file).
 */
function warnIfThemeIsEmpty(config: ExtensionConfig, theme: ParsedTheme): boolean {
  if (theme.tokens.size > 0) return false;
  vscode.window.showWarningMessage(
    `Tailwind Strict Colors: no se encontraron tokens en tu @theme (buscando "${config.themeFileGlob}"). ` +
      `Sin tokens no hay ninguna sugerencia posible — revisa "tailwindStrictColors.themeFileGlob" en tu settings.json.`
  );
  return true;
}

/** Handler for {@link FIX_ALL_IN_FILE_COMMAND}. */
async function fixAllInFile(getConfig: () => ExtensionConfig, getTheme: () => ParsedTheme): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "Tailwind Strict Colors: abre un archivo primero para poder reemplazar sus colores quemados."
    );
    return;
  }

  const document = editor.document;
  const config = getConfig();
  const theme = getTheme();
  if (warnIfThemeIsEmpty(config, theme)) return;

  if (!config.languages.includes(document.languageId)) {
    vscode.window.showInformationMessage(
      `Tailwind Strict Colors: el lenguaje "${document.languageId}" no está en "tailwindStrictColors.languages".`
    );
    return;
  }

  const { replacements, unresolvedCount } = computeAutoFix(
    document.getText(),
    { utilities: config.utilities, ignoredColorNames: config.ignoredColorNames },
    theme
  );

  if (replacements.length === 0) {
    vscode.window.showInformationMessage(
      unresolvedCount > 0
        ? `Tailwind Strict Colors: ${unresolvedCount} color(es) quemado(s) sin token para sugerir.`
        : "Tailwind Strict Colors: no se encontraron colores quemados en este archivo."
    );
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.set(document.uri, toTextEdits(document, replacements));
  await vscode.workspace.applyEdit(edit);

  vscode.window.showInformationMessage(
    `Tailwind Strict Colors: ${replacements.length} color(es) reemplazado(s)` +
      (unresolvedCount > 0 ? `, ${unresolvedCount} sin sugerencia disponible.` : ".")
  );
}

/** Handler for {@link FIX_ALL_IN_WORKSPACE_COMMAND}. Asks for confirmation before touching multiple files. */
async function fixAllInWorkspace(
  getConfig: () => ExtensionConfig,
  getTheme: () => ParsedTheme
): Promise<void> {
  const config = getConfig();
  if (warnIfThemeIsEmpty(config, getTheme())) return;

  const files = await findScannableFiles(config.languages);
  if (files.length === 0) {
    vscode.window.showInformationMessage(
      'Tailwind Strict Colors: no hay archivos que coincidan con "tailwindStrictColors.languages" en este workspace.'
    );
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Tailwind Strict Colors va a reemplazar automáticamente los colores quemados en ${files.length} archivo(s) ` +
      `del workspace. Esta acción edita varios archivos a la vez.`,
    { modal: true },
    "Sí, aplicar"
  );
  if (confirmation !== "Sí, aplicar") return;

  const theme = getTheme();
  const scanOptions = { utilities: config.utilities, ignoredColorNames: config.ignoredColorNames };

  const workspaceEdit = new vscode.WorkspaceEdit();
  const touchedUris: vscode.Uri[] = [];
  let totalReplacements = 0;
  let totalUnresolved = 0;

  for (const uri of files) {
    const document = await vscode.workspace.openTextDocument(uri);
    const { replacements, unresolvedCount } = computeAutoFix(document.getText(), scanOptions, theme);
    totalUnresolved += unresolvedCount;
    if (replacements.length === 0) continue;

    workspaceEdit.set(uri, toTextEdits(document, replacements));
    touchedUris.push(uri);
    totalReplacements += replacements.length;
  }

  if (totalReplacements === 0) {
    vscode.window.showInformationMessage(
      "Tailwind Strict Colors: no había colores quemados para reemplazar en el workspace."
    );
    return;
  }

  await vscode.workspace.applyEdit(workspaceEdit);

  for (const uri of touchedUris) {
    const document = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    await document?.save();
  }

  vscode.window.showInformationMessage(
    `Tailwind Strict Colors: ${totalReplacements} reemplazo(s) en ${touchedUris.length} archivo(s)` +
      (totalUnresolved > 0 ? `, ${totalUnresolved} sin sugerencia disponible.` : ".")
  );
}

/**
 * Registers the "Fix All" commands (file scope and workspace scope).
 *
 * @param getConfig - Returns the current extension configuration on demand.
 * @param getTheme - Returns the current parsed `@theme` on demand.
 * @returns Disposables to push onto `context.subscriptions`.
 * @example
 * ```ts
 * context.subscriptions.push(...registerFixAllCommands(() => config, () => themeWatcher.getTheme()));
 * ```
 */
export function registerFixAllCommands(
  getConfig: () => ExtensionConfig,
  getTheme: () => ParsedTheme
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(FIX_ALL_IN_FILE_COMMAND, () => fixAllInFile(getConfig, getTheme)),
    vscode.commands.registerCommand(FIX_ALL_IN_WORKSPACE_COMMAND, () =>
      fixAllInWorkspace(getConfig, getTheme)
    ),
  ];
}
