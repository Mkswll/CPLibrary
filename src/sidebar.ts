import * as vscode from "vscode";
import { Library } from "./library";

export interface SidebarSnippet {
  id: string;
  name: string;
  description: string;
  category: string;
  depCount: number;
  deps: { id: string; name: string; description: string }[];
}

export class SnippetSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly library: Library,
    private readonly onImport: (id: string) => Promise<void>,
    private readonly onPreview: (id: string) => Promise<void>
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getSidebarHtml();

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "ready") {
        this.postData();
        return;
      }
      if (msg.type === "import" && typeof msg.id === "string") {
        await this.onImport(msg.id);
      }
      if (msg.type === "preview" && typeof msg.id === "string") {
        await this.onPreview(msg.id);
      }
    });
  }

  refresh(): void {
    this.postData();
  }

  private postData(): void {
    this.view?.webview.postMessage({
      type: "data",
      snippets: this.buildSnippets(),
    });
  }

  private buildSnippets(): SidebarSnippet[] {
    return this.library.getAll().map((meta) => ({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      depCount: this.library.transitiveDepCount(meta.id),
      deps: meta.deps.map((depId) => {
        const dep = this.library.get(depId)!;
        return { id: depId, name: dep.name, description: dep.description };
      }),
    }));
  }
}

function getSidebarHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-sideBar-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .search-wrap {
      flex: 0 0 auto;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, transparent);
    }
    .search-row {
      display: flex;
      align-items: stretch;
      gap: 2px;
    }
    input {
      flex: 1;
      min-width: 0;
      margin: 0;
      padding: 3px 6px 3px 8px;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      outline: none;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font: inherit;
      line-height: 18px;
    }
    input:focus {
      border-color: var(--vscode-focusBorder, #007fd4);
      outline: 1px solid var(--vscode-focusBorder, #007fd4);
      outline-offset: -1px;
    }
    input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }
    button.clear {
      flex: 0 0 auto;
      width: 22px;
      border: none;
      background: transparent;
      color: var(--vscode-icon-foreground);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      border-radius: 2px;
      opacity: 0;
      pointer-events: none;
    }
    button.clear.visible {
      opacity: 0.75;
      pointer-events: auto;
    }
    button.clear:hover {
      opacity: 1;
      background: var(--vscode-toolbar-hoverBackground);
    }
    .status {
      flex: 0 0 auto;
      padding: 0 12px 4px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      display: none;
    }
    .status.visible { display: block; }
    .tree {
      flex: 1 1 auto;
      overflow-y: auto;
      overflow-x: hidden;
      padding-bottom: 8px;
    }
    .empty {
      padding: 12px 20px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }
    .category { margin: 0; }
    .cat-header {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      height: 22px;
      cursor: pointer;
      user-select: none;
      font-weight: 600;
    }
    .cat-header:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .chevron {
      width: 16px;
      flex: 0 0 16px;
      opacity: 0.8;
      font-size: 10px;
      text-align: center;
    }
    .cat-icon { opacity: 0.85; font-size: 14px; }
    .snippet-row {
      display: flex;
      align-items: center;
      height: 22px;
      padding-right: 4px;
    }
    .snippet-row:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .snippet-line {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      cursor: pointer;
    }
    .snippet-indent {
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
      padding-left: 12px;
      gap: 2px;
    }
    .snippet-main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }
    .snippet-name {
      flex-shrink: 0;
      white-space: nowrap;
    }
    .snippet-desc {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.92em;
      color: var(--vscode-descriptionForeground);
    }
    .snippet-actions {
      flex: 0 0 auto;
      display: none;
      gap: 2px;
      padding-left: 2px;
    }
    .snippet-row:hover .snippet-actions { display: flex; }
    .icon-btn {
      border: none;
      background: transparent;
      color: var(--vscode-icon-foreground);
      cursor: pointer;
      width: 22px;
      height: 22px;
      padding: 0;
      border-radius: 3px;
      font-size: 14px;
      line-height: 22px;
    }
    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }
    .deps { display: none; }
    .deps.open { display: block; }
    .dep-row {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 22px;
      padding: 0 8px 0 44px;
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 0.92em;
    }
    .dep-row .snippet-name {
      flex-shrink: 0;
      font-weight: normal;
      color: var(--vscode-sideBar-foreground);
      white-space: nowrap;
    }
    .dep-row .snippet-desc {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dep-toggle {
      cursor: pointer;
    }
    .dep-toggle .chevron { display: inline-block; width: 16px; }
  </style>
</head>
<body>
  <div class="panel">
    <div class="search-wrap">
      <div class="search-row">
        <input type="text" id="q" spellcheck="false" autocomplete="off"
          placeholder="Search snippets" aria-label="Search snippets" />
        <button type="button" class="clear" id="clear" title="Clear search" aria-label="Clear search">×</button>
      </div>
    </div>
    <div class="status" id="status"></div>
    <div class="tree" id="tree"></div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const input = document.getElementById("q");
    const clearBtn = document.getElementById("clear");
    const treeEl = document.getElementById("tree");
    const statusEl = document.getElementById("status");
    let allSnippets = [];
    const expandedCats = new Set();
    const expandedSnippets = new Set();

    function esc(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function matchesFilter(meta, filter) {
      if (!filter) return true;
      const haystack = [meta.id, meta.name, meta.description, meta.category]
        .join(" ")
        .toLowerCase();
      const tokens = filter.toLowerCase().split(/\\s+/).filter(Boolean);
      return tokens.every((t) => haystack.includes(t));
    }

    function syncClearButton() {
      clearBtn.classList.toggle("visible", input.value.length > 0);
    }

    function render() {
      const filter = input.value.trim();
      const filtered = allSnippets.filter((s) => matchesFilter(s, filter));
      const categories = [...new Set(filtered.map((s) => s.category))].sort();

      if (filter) {
        statusEl.textContent =
          filtered.length === 0
            ? "No snippets match your filter."
            : "Showing " + filtered.length + " of " + allSnippets.length + " snippets.";
        statusEl.classList.add("visible");
      } else {
        statusEl.classList.remove("visible");
      }

      if (!categories.length) {
        treeEl.innerHTML = '<div class="empty">No snippets in library.</div>';
        return;
      }

      let html = "";
      for (const cat of categories) {
        if (filter) {
          expandedCats.add(cat);
        }
        const inCat = filtered.filter((s) => s.category === cat);
        const open = expandedCats.has(cat);
        html += '<div class="category">';
        html += '<div class="cat-header" data-cat="' + esc(cat) + '">';
        html += '<span class="chevron">' + (open ? "▼" : "▶") + "</span>";
        html += "<span>" + esc(cat) + "</span>";
        html += "</div>";
        if (open) {
          for (const s of inCat) {
            const depHint =
              s.depCount > 0
                ? " · " + s.depCount + " dep" + (s.depCount === 1 ? "" : "s")
                : "";
            const hasDeps = s.deps.length > 0;
            const depsOpen = expandedSnippets.has(s.id);
            html += '<div class="snippet-row">';
            html += '<div class="snippet-line">';
            html += '<div class="snippet-indent">';
            if (hasDeps) {
              html +=
                '<span class="chevron dep-toggle" data-snippet="' +
                esc(s.id) +
                '">' +
                (depsOpen ? "▼" : "▶") +
                "</span>";
            } else {
              html += '<span class="chevron" style="visibility:hidden">▶</span>';
            }
            const tip = s.name + " — " + s.description + depHint;
            html +=
              '<div class="snippet-main" data-import="' +
              esc(s.id) +
              '" title="' +
              esc(tip) +
              '">';
            html += '<span class="snippet-name">' + esc(s.name) + "</span>";
            html +=
              '<span class="snippet-desc">' +
              esc(s.description + depHint) +
              "</span>";
            html += "</div></div></div>";
            html +=
              '<div class="snippet-actions">' +
              '<button class="icon-btn" title="Import" data-import="' +
              esc(s.id) +
              '">⤓</button>' +
              '<button class="icon-btn" title="Preview" data-preview="' +
              esc(s.id) +
              '">⧉</button>' +
              "</div>";
            html += "</div>";
            if (hasDeps) {
              html +=
                '<div class="deps' +
                (depsOpen ? " open" : "") +
                '" id="deps-' +
                esc(s.id) +
                '">';
              for (const d of s.deps) {
                html +=
                  '<div class="dep-row" title="' +
                  esc(d.name + " — " + d.description) +
                  '">';
                html += '<span class="snippet-name">' + esc(d.name) + "</span>";
                html +=
                  '<span class="snippet-desc">' + esc(d.description) + "</span>";
                html += "</div>";
              }
              html += "</div>";
            }
          }
        }
        html += "</div>";
      }
      treeEl.innerHTML = html;
    }

    treeEl.addEventListener("click", (e) => {
      const t = e.target;
      const catEl = t.closest("[data-cat]");
      if (catEl) {
        const cat = catEl.dataset.cat;
        if (expandedCats.has(cat)) expandedCats.delete(cat);
        else expandedCats.add(cat);
        render();
        return;
      }
      const snipEl = t.closest("[data-snippet]");
      if (snipEl) {
        const id = snipEl.dataset.snippet;
        if (expandedSnippets.has(id)) expandedSnippets.delete(id);
        else expandedSnippets.add(id);
        render();
        return;
      }
      const importEl = t.closest("[data-import]");
      if (importEl) {
        vscode.postMessage({ type: "import", id: importEl.dataset.import });
        return;
      }
      const previewEl = t.closest("[data-preview]");
      if (previewEl) {
        vscode.postMessage({ type: "preview", id: previewEl.dataset.preview });
      }
    });

    input.addEventListener("input", () => {
      syncClearButton();
      render();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        input.value = "";
        syncClearButton();
        render();
        input.blur();
      }
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      syncClearButton();
      render();
      input.focus();
    });

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "data" && Array.isArray(msg.snippets)) {
        allSnippets = msg.snippets;
        for (const s of allSnippets) {
          if (!expandedCats.has(s.category)) expandedCats.add(s.category);
        }
        render();
      }
    });

    syncClearButton();
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}
