import * as vscode from "vscode";
import { Library } from "./library";
import { Snippet } from "./types";

interface PreviewData {
  snippetId: string;
  name?: string;
  description?: string;
  order: Snippet[];
  skipped: Snippet[];
  toInsert: Snippet[];
}

const openPreviewPanels = new Set<vscode.WebviewPanel>();

function escHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPreviewColumn(): vscode.ViewColumn {
  for (const panel of openPreviewPanels) {
    if (panel.viewColumn !== undefined) {
      return panel.viewColumn;
    }
  }
  return vscode.ViewColumn.Beside;
}

function renderSnippetBlocks(snippets: Snippet[]): string {
  if (snippets.length === 0) {
    return '<p class="empty-code">Nothing new to insert.</p>';
  }
  return snippets
    .map((snippet) => {
      const body = escHtml(snippet.content.replace(/\s+$/, ""));
      return `<div class="import-block">
  <div class="marker">// @cplib ${escHtml(snippet.id)}</div>
  <pre class="code-body">${body}</pre>
  <div class="marker end">// @cplib-end ${escHtml(snippet.id)}</div>
</div>`;
    })
    .join("");
}

function formatPreviewTitle(snippetId: string, name?: string): string {
  const label =
    name && name !== snippetId ? `${snippetId} — ${name}` : name || snippetId;
  return `Import plan for ${escHtml(label)}`;
}

function renderPreviewHtml(data: PreviewData): string {
  const title = formatPreviewTitle(data.snippetId, data.name);
  const desc = data.description
    ? `<p class="desc">${escHtml(data.description)}</p>`
    : "";
  const orderItems = data.order
    .map((s) => {
      const skipped = data.skipped.some((sk) => sk.id === s.id);
      const snippetDesc = s.description ? ` — ${escHtml(s.description)}` : "";
      const tag = skipped ? ' <span class="skipped">(already in file)</span>' : "";
      return `<li><span class="snippet-id">${escHtml(s.id)}</span>${snippetDesc}${tag}</li>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px 20px 24px;
      margin: 0;
      line-height: 1.5;
    }
    h1 {
      font-size: 1.15em;
      font-weight: 600;
      margin: 0 0 8px;
      line-height: 1.35;
    }
    .desc {
      color: var(--vscode-descriptionForeground);
      margin: 0 0 16px;
    }
    .label {
      font-size: 0.85em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      margin: 20px 0 8px;
    }
    .order {
      margin: 0;
      padding-left: 1.25em;
    }
    .order li {
      margin: 6px 0;
    }
    .snippet-id {
      font-weight: 600;
      font-family: var(--vscode-editor-font-family);
    }
    .skipped {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      font-weight: normal;
    }
    .code-wrap {
      margin-top: 8px;
      border: 1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border, #444));
      border-radius: 6px;
      overflow: hidden;
      background: var(--vscode-editor-background);
    }
    .import-block + .import-block {
      border-top: 1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border, #444));
    }
    .marker {
      padding: 6px 14px;
      font-family: var(--vscode-editor-font-family);
      font-size: calc(var(--vscode-editor-font-size) * 0.92);
      color: var(--vscode-textPreformat-foreground, #6a9955);
      background: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.1));
      border-bottom: 1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border, #333));
    }
    .marker.end {
      border-bottom: none;
      border-top: 1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border, #333));
    }
    .code-body {
      margin: 0;
      padding: 12px 14px;
      overflow-x: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
      tab-size: 4;
      white-space: pre;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
    }
    .empty-code {
      margin: 0;
      padding: 14px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      border: 1px dashed var(--vscode-widget-border, #555);
      border-radius: 6px;
      background: var(--vscode-input-background);
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${desc}
  <p class="label">Resolved order</p>
  <ol class="order">${orderItems}</ol>
  <p class="label">Generated text</p>
  <div class="code-wrap">${renderSnippetBlocks(data.toInsert)}</div>
</body>
</html>`;
}

export async function previewSnippet(
  library: Library,
  snippetId: string
): Promise<void> {
  const detectExisting = vscode.workspace
    .getConfiguration("cplib")
    .get<boolean>("detectExisting", true);
  const fileText = vscode.window.activeTextEditor?.document.getText() ?? "";

  const resolved = await library.resolveImport(
    [snippetId],
    fileText,
    detectExisting
  );

  const root = library.get(snippetId);
  const data: PreviewData = {
    snippetId,
    name: root?.name,
    description: root?.description,
    order: resolved.order,
    skipped: resolved.skipped,
    toInsert: resolved.toInsert,
  };

  const column = getPreviewColumn();
  const panel = vscode.window.createWebviewPanel(
    "cplibPreview",
    root ? `Preview: ${snippetId}` : `Preview: ${snippetId}`,
    column,
    { enableScripts: false, retainContextWhenHidden: true }
  );

  openPreviewPanels.add(panel);
  panel.onDidDispose(() => openPreviewPanels.delete(panel));

  panel.webview.html = renderPreviewHtml(data);
  panel.reveal(column, false);
}
