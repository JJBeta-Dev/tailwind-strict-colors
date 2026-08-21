import * as vscode from "vscode";
import * as path from "node:path";
import { ExtensionConfig } from "./config";
import { ParsedTheme } from "./cssThemeParser";
import { FileScanResult, scanWorkspace } from "./workspaceScan";
import { FIX_ALL_IN_WORKSPACE_COMMAND } from "./fixAllCommands";

/** One burned-color occurrence as rendered by `media/main.js`. */
interface WebviewIssue {
  text: string;
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

/** One file group as rendered by `media/main.js`. */
interface WebviewFile {
  uriString: string;
  baseName: string;
  dirPath: string;
  issues: WebviewIssue[];
}

/** Message sent from the webview when the user clicks an issue row (jump to that location). */
interface OpenMessage {
  type: "open";
  uriString: string;
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

/** Every message shape the extension host accepts from `media/main.js`. */
type WebviewMessage = { type: "ready" } | { type: "fixAll" } | OpenMessage;

/** Shape of the `{ type: "update" }` message the extension host pushes to the webview. */
interface WebviewPayload {
  files: WebviewFile[];
  themeTokenCount: number;
  themeFileGlob: string;
}

/** Serializes a workspace scan into the plain-data shape `media/main.js` renders. */
function toPayload(
  results: FileScanResult[],
  themeTokenCount: number,
  themeFileGlob: string
): WebviewPayload {
  return {
    themeTokenCount,
    themeFileGlob,
    files: results.map((result) => {
      const relative = vscode.workspace.asRelativePath(result.uri);
      const dirPath = path.dirname(relative);
      return {
        uriString: result.uri.toString(),
        baseName: path.basename(result.uri.fsPath),
        dirPath: dirPath === "." ? "" : dirPath,
        issues: result.matches.map((match) => {
          const start = result.document.positionAt(match.start);
          const end = result.document.positionAt(match.end);
          return {
            text: match.text,
            startLine: start.line,
            startChar: start.character,
            endLine: end.line,
            endChar: end.character,
          };
        }),
      };
    }),
  };
}

/** Generates a random nonce for the webview's Content-Security-Policy script-src. */
function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}

/**
 * Backs the "Colores quemados" Activity Bar panel: a webview (not a native
 * `TreeView`) so it can render file-type icons, warning colors, and a
 * search box that match the IDE's own look via `--vscode-*` CSS variables
 * and bundled codicons (see `media/main.css`, `media/main.js`).
 */
export class BurnedColorsWebviewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private results: FileScanResult[] = [];
  private scanning = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly getConfig: () => ExtensionConfig,
    private readonly getTheme: () => ParsedTheme
  ) {}

  /** {@inheritDoc} */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    webviewView.webview.html = this.buildHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => this.handleMessage(message));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    this.postUpdate();
  }

  /**
   * Re-scans the workspace and pushes the new results to the webview (if
   * currently visible/resolved) and to the view's `description` label.
   * Safe to call while a previous refresh is still running — the call is a
   * no-op in that case rather than overlapping scans.
   */
  async refresh(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      this.results = await scanWorkspace(this.getConfig(), this.getTheme());
    } finally {
      this.scanning = false;
      if (this.view) {
        const count = this.getTotalIssueCount();
        this.view.description = count > 0 ? `${count} encontrados` : "Sin hallazgos";
      }
      this.postUpdate();
    }
  }

  /** Total number of burned-color occurrences across the last completed scan. */
  getTotalIssueCount(): number {
    return this.results.reduce((sum, result) => sum + result.matches.length, 0);
  }

  /** Sends the current scan results to the webview, if one is resolved. */
  private postUpdate(): void {
    if (!this.view) return;
    const config = this.getConfig();
    const payload = toPayload(this.results, this.getTheme().tokens.size, config.themeFileGlob);
    this.view.webview.postMessage({ type: "update", payload });
  }

  /** Dispatches a message received from `media/main.js` (see {@link WebviewMessage}). */
  private handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case "ready":
        this.postUpdate();
        return;
      case "open": {
        const uri = vscode.Uri.parse(message.uriString);
        const selection = new vscode.Range(
          message.startLine,
          message.startChar,
          message.endLine,
          message.endChar
        );
        vscode.window.showTextDocument(uri, { selection });
        return;
      }
      case "fixAll":
        vscode.commands.executeCommand(FIX_ALL_IN_WORKSPACE_COMMAND);
        return;
    }
  }

  /** Builds the webview's HTML shell: a strict CSP, the codicon/main stylesheets, and `media/main.js`. */
  private buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const mediaUri = (...segments: string[]) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", ...segments));

    const codiconCssUri = mediaUri("codicons", "codicon.css");
    const mainCssUri = mediaUri("main.css");
    const mainJsUri = mediaUri("main.js");

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
<link rel="stylesheet" href="${codiconCssUri}" />
<link rel="stylesheet" href="${mainCssUri}" />
</head>
<body>
<div class="search-box">
  <span class="codicon codicon-search"></span>
  <input id="search" type="text" placeholder="Filtrar por archivo o clase..." />
</div>
<div id="root"></div>
<script nonce="${nonce}" src="${mainJsUri}"></script>
</body>
</html>`;
  }
}
