import * as vscode from "vscode";
import { ExtensionConfig } from "./config";
import { ParsedTheme } from "./cssThemeParser";
import { BurnedColorMatch, scanForBurnedColors } from "./colorScanner";
import { rankSuggestions } from "./colorDistance";

/** Command id used by the "Reemplazar" link inside the hover tooltip. */
export const APPLY_HOVER_SUGGESTION_COMMAND = "tailwindStrictColors.applyHoverSuggestion";

/** Payload encoded into a hover's `command:` link, round-tripped through `MarkdownString`. */
interface ApplySuggestionArgs {
  uriString: string;
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
  replacement: string;
}

/** Renders a tiny rounded-square color swatch as an inline `data:` SVG image for the hover markdown. */
function swatchDataUri(hex: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11"><rect width="11" height="11" rx="3" fill="${hex}" stroke="#00000040" stroke-width="1"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Builds the hover tooltip content: a warning line plus one entry per ranked
 * suggestion (color swatch, class name, and a `command:` link that applies
 * it via {@link APPLY_HOVER_SUGGESTION_COMMAND}).
 */
function buildHoverMarkdown(
  uri: vscode.Uri,
  match: BurnedColorMatch,
  range: vscode.Range,
  theme: ParsedTheme,
  maxSuggestions: number
): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;

  md.appendMarkdown(`$(warning) **Color quemado de Tailwind:** \`${match.text}\`\n\n`);

  if (theme.tokens.size === 0) {
    md.appendMarkdown("No se encontró tu `@theme` — no hay tokens en tu paleta para sugerir un reemplazo.");
    return md;
  }

  const suggestions = rankSuggestions(match, theme.tokens, maxSuggestions);
  if (suggestions.length === 0) {
    md.appendMarkdown("No hay tokens en tu `@theme` para sugerir.");
    return md;
  }

  md.appendMarkdown("Sugerencias de tu paleta (más cercana primero):\n\n");

  for (const suggestion of suggestions) {
    const token = theme.tokens.get(suggestion.tokenName);
    const swatch = token?.resolvedHex ? `![](${swatchDataUri(token.resolvedHex)}) ` : "";
    const args: ApplySuggestionArgs = {
      uriString: uri.toString(),
      startLine: range.start.line,
      startChar: range.start.character,
      endLine: range.end.line,
      endChar: range.end.character,
      replacement: suggestion.replacementClass,
    };
    const commandUri = `command:${APPLY_HOVER_SUGGESTION_COMMAND}?${encodeURIComponent(JSON.stringify(args))}`;
    md.appendMarkdown(`${swatch}\`${suggestion.replacementClass}\` — [Reemplazar](${commandUri})\n\n`);
  }

  return md;
}

/** Shows replacement suggestions when hovering over a burned Tailwind color class. */
export class BurnedColorHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly getConfig: () => ExtensionConfig,
    private readonly getTheme: () => ParsedTheme
  ) {}

  /** {@inheritDoc} */
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const config = this.getConfig();
    const theme = this.getTheme();
    const offset = document.offsetAt(position);

    const matches = scanForBurnedColors(
      document.getText(),
      { utilities: config.utilities, ignoredColorNames: config.ignoredColorNames },
      theme
    );
    const match = matches.find((m) => offset >= m.start && offset < m.end);
    if (!match) return undefined;

    const range = new vscode.Range(document.positionAt(match.start), document.positionAt(match.end));
    return new vscode.Hover(
      buildHoverMarkdown(document.uri, match, range, theme, config.maxSuggestions),
      range
    );
  }
}

/** Command handler for the hover tooltip's "Reemplazar" link: applies exactly one replacement. */
async function applyHoverSuggestion(args: ApplySuggestionArgs): Promise<void> {
  const uri = vscode.Uri.parse(args.uriString);
  const range = new vscode.Range(args.startLine, args.startChar, args.endLine, args.endChar);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, args.replacement);
  await vscode.workspace.applyEdit(edit);
}

/**
 * Registers the hover provider and its companion "apply suggestion" command.
 *
 * @param getConfig - Returns the current extension configuration on demand.
 * @param getTheme - Returns the current parsed `@theme` on demand.
 * @returns Disposables to push onto `context.subscriptions`.
 * @example
 * ```ts
 * context.subscriptions.push(...registerHoverProvider(() => config, () => themeWatcher.getTheme()));
 * ```
 */
export function registerHoverProvider(
  getConfig: () => ExtensionConfig,
  getTheme: () => ParsedTheme
): vscode.Disposable[] {
  return [
    vscode.languages.registerHoverProvider(
      getConfig().languages,
      new BurnedColorHoverProvider(getConfig, getTheme)
    ),
    vscode.commands.registerCommand(APPLY_HOVER_SUGGESTION_COMMAND, applyHoverSuggestion),
  ];
}
