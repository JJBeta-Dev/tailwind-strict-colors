import * as vscode from "vscode";
import { parseTheme, ParsedTheme } from "./cssThemeParser";

/**
 * Locates the CSS file(s) matching `themeFileGlob` in each workspace folder,
 * parses their `@theme` blocks, and keeps the result up to date as the files
 * are created, edited, or deleted.
 */
export class ThemeWatcher implements vscode.Disposable {
  private theme: ParsedTheme = { tokens: new Map() };
  private watcher?: vscode.FileSystemWatcher;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private globPattern: string) {}

  getTheme(): ParsedTheme {
    return this.theme;
  }

  async start(): Promise<void> {
    await this.refresh();
    this.watcher = vscode.workspace.createFileSystemWatcher(`**/${this.stripLeadingGlob()}`);
    this.disposables.push(
      this.watcher,
      this.watcher.onDidChange(() => this.refresh()),
      this.watcher.onDidCreate(() => this.refresh()),
      this.watcher.onDidDelete(() => this.refresh())
    );
  }

  async setGlobPattern(pattern: string): Promise<void> {
    this.globPattern = pattern;
    this.watcher?.dispose();
    await this.start();
  }

  private stripLeadingGlob(): string {
    // createFileSystemWatcher already prefixes with a base; avoid a doubled "**/**/".
    return this.globPattern.replace(/^\*\*\//, "");
  }

  private async refresh(): Promise<void> {
    const uris = await vscode.workspace.findFiles(this.globPattern, "**/node_modules/**");
    const sources: string[] = [];

    for (const uri of uris) {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        sources.push(Buffer.from(bytes).toString("utf8"));
      } catch {
        // File may have just been deleted between findFiles and readFile; ignore.
      }
    }

    this.theme = parseTheme(sources);
    this.onDidChangeEmitter.fire();
  }

  dispose(): void {
    this.onDidChangeEmitter.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
