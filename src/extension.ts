import * as vscode from "vscode";
import { ExtensionConfig, onConfigChanged, readConfig } from "./config";
import { ThemeWatcher } from "./themeWatcher";
import { DiagnosticsManager } from "./diagnostics";
import { BurnedColorCodeActionProvider } from "./codeActionProvider";
import { registerFixAllCommands } from "./fixAllCommands";
import { BurnedColorsWebviewProvider } from "./problemsWebviewProvider";
import { registerHoverProvider } from "./hoverProvider";

const DEBOUNCE_MS = 300;
const WORKSPACE_SCAN_DEBOUNCE_MS = 500;

export function activate(context: vscode.ExtensionContext): void {
  let config: ExtensionConfig = readConfig();
  const themeWatcher = new ThemeWatcher(config.themeFileGlob);
  const diagnostics = new DiagnosticsManager();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const updateDocument = (document: vscode.TextDocument): void => {
    diagnostics.updateDocument(document, config, themeWatcher.getTheme());
  };

  const scheduleUpdate = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key);
        updateDocument(document);
      }, DEBOUNCE_MS)
    );
  };

  const rescanAllOpenDocuments = (): void => {
    for (const document of vscode.workspace.textDocuments) updateDocument(document);
  };

  const problemsProvider = new BurnedColorsWebviewProvider(
    context.extensionUri,
    () => config,
    () => themeWatcher.getTheme()
  );
  // Manual invocations (command palette / toolbar button) confirm with a toast;
  // automatic ones (on save, on theme change) stay silent to avoid spamming notifications.
  const refreshProblemsView = async (options: { silent?: boolean } = {}): Promise<void> => {
    await problemsProvider.refresh();
    if (options.silent) return;

    const count = problemsProvider.getTotalIssueCount();
    vscode.window.showInformationMessage(
      count > 0
        ? `Tailwind Strict Colors: ${count} color(es) quemado(s) encontrado(s) en el proyecto.`
        : "Tailwind Strict Colors: no se encontraron colores quemados en el proyecto."
    );
  };
  const refreshProblemsViewSilently = (): void => {
    void refreshProblemsView({ silent: true });
  };

  let workspaceScanTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleWorkspaceScan = (): void => {
    if (workspaceScanTimer) clearTimeout(workspaceScanTimer);
    workspaceScanTimer = setTimeout(refreshProblemsViewSilently, WORKSPACE_SCAN_DEBOUNCE_MS);
  };

  themeWatcher.start().then(() => {
    rescanAllOpenDocuments();
    refreshProblemsViewSilently();
  });

  context.subscriptions.push(
    themeWatcher,
    diagnostics,
    vscode.window.registerWebviewViewProvider("tailwindStrictColors.problemsView", problemsProvider),
    themeWatcher.onDidChange(rescanAllOpenDocuments),
    themeWatcher.onDidChange(scheduleWorkspaceScan),
    vscode.workspace.onDidSaveTextDocument(scheduleWorkspaceScan),
    vscode.commands.registerCommand("tailwindStrictColors.refreshProblemsView", () => refreshProblemsView()),

    onConfigChanged(() => {
      const previousGlob = config.themeFileGlob;
      config = readConfig();
      if (config.themeFileGlob !== previousGlob) {
        themeWatcher.setGlobPattern(config.themeFileGlob).then(rescanAllOpenDocuments);
      } else {
        rescanAllOpenDocuments();
      }
      refreshProblemsViewSilently();
    }),

    vscode.workspace.onDidOpenTextDocument(updateDocument),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleUpdate(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.clearDocument(document.uri)),

    vscode.languages.registerCodeActionsProvider(
      config.languages,
      new BurnedColorCodeActionProvider(() => config, () => themeWatcher.getTheme()),
      { providedCodeActionKinds: BurnedColorCodeActionProvider.providedCodeActionKinds }
    ),

    ...registerFixAllCommands(() => config, () => themeWatcher.getTheme()),
    ...registerHoverProvider(() => config, () => themeWatcher.getTheme())
  );

  for (const document of vscode.workspace.textDocuments) updateDocument(document);
}

export function deactivate(): void {
  // All resources are disposed via context.subscriptions.
}
