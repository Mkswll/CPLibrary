import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Library } from "./library";
import { SnippetMeta } from "./types";

export interface FormInit {
  mode: "add" | "edit";
  meta?: SnippetMeta;
  categories: string[];
  depOptions: { id: string; name: string; description: string }[];
  excludeId?: string;
  initialCode?: string;
}

export interface FormSubmit {
  id: string;
  name: string;
  description: string;
  category: string;
  file: string;
  deps: string[];
  pastedCode?: string;
  fileMode?: "existing" | "new";
}

type RefreshFn = () => Promise<void>;

class RenameCancelledError extends Error {
  constructor() {
    super("Rename cancelled.");
    this.name = "RenameCancelledError";
  }
}

export async function openSnippetForm(
  library: Library,
  init: FormInit,
  refresh: RefreshFn
): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    "cplibSnippetForm",
    init.mode === "add" ? "Add Snippet" : `Edit: ${init.meta?.id}`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = getFormHtml(panel.webview);

  panel.webview.onDidReceiveMessage(async (msg) => {
    try {
      if (msg.type === "ready") {
        let data = init;
        if (init.mode === "edit" && init.meta) {
          try {
            const snippet = await library.readSnippet(init.meta.id);
            data = { ...init, initialCode: snippet.content };
          } catch {
            // leave initialCode unset if file missing
          }
        }
        panel.webview.postMessage({ type: "init", data });
        return;
      }
      if (msg.type === "browseExisting") {
        const libraryUri = vscode.Uri.file(library.getLibraryPath());
        const picked = await vscode.window.showOpenDialog({
          defaultUri: libraryUri,
          canSelectMany: false,
          filters: { Headers: ["h", "hpp"], "All Files": ["*"] },
          title: "Pick an existing snippet file (navigate into subfolders)",
        });
        if (picked?.length) {
          const rel = library.toRelativeFile(picked[0].fsPath);
          panel.webview.postMessage({ type: "filePicked", file: rel, target: "existing" });
        }
        return;
      }
      if (msg.type === "choosePath") {
        const libraryUri = vscode.Uri.file(library.getLibraryPath());
        const hint = (msg.file as string | undefined)?.trim();
        const idHint = (msg.id as string | undefined)?.trim();
        const target = (msg.target as string | undefined) === "edit" ? "edit" : "new";
        let defaultUri: vscode.Uri = libraryUri;
        if (hint) {
          defaultUri = vscode.Uri.file(
            path.join(library.getLibraryPath(), hint.replace(/\\/g, "/"))
          );
        } else if (idHint) {
          defaultUri = vscode.Uri.joinPath(libraryUri, `${idHint}.h`);
        }
        const saved = await vscode.window.showSaveDialog({
          defaultUri,
          filters: { Headers: ["h", "hpp"] },
          title: "Choose path in library — create folders and name the file",
        });
        if (saved) {
          const rel = library.toRelativeFile(saved.fsPath);
          panel.webview.postMessage({ type: "filePicked", file: rel, target });
        }
        return;
      }
      if (msg.type === "save") {
        try {
          await handleSave(
            library,
            init.mode,
            msg.data as FormSubmit,
            refresh,
            init.meta?.id
          );
          panel.dispose();
        } catch (err) {
          if (err instanceof RenameCancelledError) {
            panel.webview.postMessage({ type: "error", message: err.message });
            return;
          }
          throw err;
        }
        return;
      }
      if (msg.type === "remove" && init.mode === "edit" && init.meta) {
        const removed = await openRemoveConfirm(library, init.meta, refresh);
        if (removed) {
          panel.dispose();
        }
        return;
      }
      if (msg.type === "delete" && init.mode === "edit" && init.meta) {
        const deleted = await openDeleteConfirm(library, init.meta, refresh);
        if (deleted) {
          panel.dispose();
        }
        return;
      }
      if (msg.type === "cancel") {
        panel.dispose();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      panel.webview.postMessage({ type: "error", message });
    }
  });
}

async function handleSave(
  library: Library,
  mode: "add" | "edit",
  data: FormSubmit,
  refresh: RefreshFn,
  originalId?: string
): Promise<void> {
  const id = data.id.trim();
  const name = data.name.trim();
  const category = data.category.trim();
  const file = data.file.trim().replace(/\\/g, "/");

  if (!id) {
    throw new Error("ID is required.");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) {
    throw new Error(
      "ID must start with a letter or underscore and contain only letters, numbers, and underscores."
    );
  }
  if (mode === "add" && library.hasId(id)) {
    throw new Error(`Snippet "${id}" already exists.`);
  }
  if (mode === "edit" && originalId && id !== originalId && library.hasId(id)) {
    throw new Error(`Snippet "${id}" already exists.`);
  }
  if (!name) {
    throw new Error("Display name is required.");
  }
  if (!category) {
    throw new Error("Category is required.");
  }
  if (!file) {
    throw new Error("Library file path is required.");
  }
  if (file.includes("..")) {
    throw new Error("File path must be relative to the library folder.");
  }

  const absFile = path.join(library.getLibraryPath(), file);

  if (mode === "add") {
    if (data.fileMode === "existing") {
      if (!fs.existsSync(absFile)) {
        throw new Error(`File not found: ${file}. Pick an existing file in the library.`);
      }
    } else {
      const pasted = data.pastedCode?.trim();
      if (!pasted) {
        throw new Error("Paste snippet code to create the new file.");
      }
      await fs.promises.mkdir(path.dirname(absFile), { recursive: true });
      await fs.promises.writeFile(absFile, data.pastedCode!, "utf8");
    }
  } else {
    const originalFile = originalId
      ? library.get(originalId)?.file.replace(/\\/g, "/")
      : undefined;
    const absOld = originalFile
      ? path.join(library.getLibraryPath(), originalFile)
      : undefined;
    const pathChanged = Boolean(originalFile && file !== originalFile);
    const samePath = (a: string, b: string) =>
      path.resolve(a) === path.resolve(b);

    const pasted = data.pastedCode?.trim();
    if (pasted) {
      await fs.promises.mkdir(path.dirname(absFile), { recursive: true });
      await fs.promises.writeFile(absFile, pasted, "utf8");
      if (absOld && pathChanged && fs.existsSync(absOld) && !samePath(absOld, absFile)) {
        await fs.promises.unlink(absOld);
      }
    } else if (pathChanged) {
      if (!absOld || !fs.existsSync(absOld)) {
        throw new Error(
          `File not found: ${originalFile}. Paste code or pick a valid path.`
        );
      }
      if (fs.existsSync(absFile) && !samePath(absOld, absFile)) {
        throw new Error(`File already exists: ${file}`);
      }
      await fs.promises.mkdir(path.dirname(absFile), { recursive: true });
      await fs.promises.rename(absOld, absFile);
    } else if (!fs.existsSync(absFile)) {
      throw new Error(`File not found: ${file}. Paste code or pick a valid path.`);
    }
  }

  for (const dep of data.deps) {
    if (dep === id) {
      throw new Error("A snippet cannot depend on itself.");
    }
    if (!library.hasId(dep) && mode === "edit") {
      throw new Error(`Unknown dependency: ${dep}`);
    }
    if (mode === "add" && !library.hasId(dep)) {
      throw new Error(`Unknown dependency: ${dep}`);
    }
  }

  const meta: SnippetMeta = {
    id,
    file,
    name,
    description: data.description.trim(),
    category,
    deps: data.deps,
  };

  let renameDependents: string[] = [];
  if (mode === "edit" && originalId && id !== originalId) {
    const pendingDependents = library.getDependents(originalId);
    const lines = [
      `Rename "${originalId}" to "${id}"?`,
      "",
      "manifest.json will be updated:",
      "• This snippet's ID",
      pendingDependents.length > 0
        ? `• deps in other snippets: ${pendingDependents.join(", ")}`
        : "• No other snippets list this ID in their deps",
      "",
      "// @cplib markers already in your source files are not changed.",
    ];
    const choice = await vscode.window.showWarningMessage(
      lines.join("\n"),
      { modal: true },
      "Rename"
    );
    if (choice !== "Rename") {
      throw new RenameCancelledError();
    }
    renameDependents = await library.renameSnippet(originalId, id);
  }

  await library.upsertSnippet(meta);
  await refresh();
  if (mode === "edit" && originalId && id !== originalId) {
    const depNote =
      renameDependents.length > 0
        ? ` Updated deps in: ${renameDependents.join(", ")}.`
        : "";
    vscode.window.showInformationMessage(
      `Renamed "${originalId}" to "${id}".${depNote} // @cplib markers in open files were not changed.`
    );
    return;
  }
  vscode.window.showInformationMessage(
    mode === "add" ? `Added snippet "${id}".` : `Updated "${id}".`
  );
}

export async function openRemoveConfirm(
  library: Library,
  meta: SnippetMeta,
  refresh: RefreshFn
): Promise<boolean> {
  const dependents = library.getDependents(meta.id);
  if (dependents.length > 0) {
    vscode.window.showErrorMessage(
      `Cannot remove "${meta.id}": required by ${dependents.join(", ")}. Edit those snippets and remove the dependency first.`
    );
    return false;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Remove "${meta.id}" from the library? (The .h file is not deleted.)`,
    { modal: true },
    "Remove"
  );
  if (confirm !== "Remove") {
    return false;
  }
  try {
    await library.removeSnippet(meta.id);
    await refresh();
    vscode.window.showInformationMessage(`Removed "${meta.id}" from the library.`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`CP Library: ${message}`);
    return false;
  }
}

export async function openDeleteConfirm(
  library: Library,
  meta: SnippetMeta,
  refresh: RefreshFn
): Promise<boolean> {
  const dependents = library.getDependents(meta.id);
  if (dependents.length > 0) {
    vscode.window.showErrorMessage(
      `Cannot delete "${meta.id}": required by ${dependents.join(", ")}. Edit those snippets and remove the dependency first.`
    );
    return false;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete "${meta.id}"? This removes it from the library and deletes ${meta.file}.`,
    { modal: true },
    "Delete"
  );
  if (confirm !== "Delete") {
    return false;
  }
  try {
    await library.deleteSnippet(meta.id);
    await refresh();
    vscode.window.showInformationMessage(`Deleted snippet "${meta.id}".`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`CP Library: ${message}`);
    return false;
  }
}

function getFormHtml(webview: vscode.Webview): string {
  const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'unsafe-inline';`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    * { box-sizing: border-box; }
    html {
      width: 100%;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      width: 100%;
      margin: 0;
      padding: 16px 20px 24px;
    }
    .form {
      max-width: 640px;
      margin: 0 auto;
    }
    h1 {
      font-size: 1.3em;
      font-weight: 600;
      margin: 0 0 16px;
    }
    label {
      display: block;
      margin-top: 14px;
      margin-bottom: 4px;
      font-weight: 500;
    }
    .hint {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .category-wrap {
      position: relative;
    }
    .category-menu {
      display: none;
      position: absolute;
      top: calc(100% + 2px);
      left: 0;
      right: 0;
      z-index: 20;
      max-height: 180px;
      overflow-y: auto;
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, #444));
      border-radius: 2px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    .category-menu.open {
      display: block;
    }
    .category-option {
      display: block;
      width: 100%;
      text-align: left;
      padding: 5px 8px;
      border: none;
      background: transparent;
      color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
      font: inherit;
      cursor: pointer;
    }
    .category-option:hover {
      background: var(--vscode-list-hoverBackground);
    }
    input[type="text"], textarea, select {
      width: 100%;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      font-family: inherit;
      font-size: inherit;
    }
    input::placeholder,
    textarea::placeholder {
      color: var(--vscode-input-placeholderForeground);
      opacity: 1;
    }
    textarea { min-height: 72px; resize: vertical; }
    textarea.code-box {
      min-height: 200px;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.4;
      tab-size: 4;
    }
    input:disabled {
      opacity: 0.7;
    }
    .file-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .file-row input { flex: 1; }
    .deps {
      border: 1px solid var(--vscode-widget-border, #444);
      border-radius: 4px;
      padding: 8px 10px;
      max-height: 220px;
      overflow-y: auto;
      margin-top: 4px;
    }
    .dep-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 5px 0;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
    }
    .dep-item:last-child { border-bottom: none; }
    .dep-item label {
      margin: 0;
      font-weight: normal;
      cursor: pointer;
      flex: 1;
    }
    .dep-id { font-weight: 600; }
    .dep-desc {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    .empty-deps {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 4px 0;
    }
    .error {
      display: none;
      margin-top: 12px;
      padding: 8px 10px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      border-radius: 2px;
      font-size: 0.9em;
    }
    .error.visible { display: block; }
    .actions {
      margin-top: 20px;
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .danger-actions {
      margin-left: auto;
      display: flex;
      gap: 10px;
    }
    button {
      padding: 6px 14px;
      font-family: inherit;
      font-size: inherit;
      cursor: pointer;
      border: none;
      border-radius: 2px;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    .danger {
      background: transparent;
      color: var(--vscode-errorForeground);
      border: 1px solid var(--vscode-errorForeground);
    }
    .tabbar {
      display: flex;
      gap: 0;
      margin: 6px 0 0;
      border-bottom: 1px solid var(--vscode-widget-border, #444);
    }
    .tab {
      padding: 6px 12px;
      background: transparent;
      color: var(--vscode-foreground);
      border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      opacity: 0.75;
    }
    .tab:hover { opacity: 1; }
    .tab.active {
      opacity: 1;
      border-bottom-color: var(--vscode-focusBorder, #007fd4);
      font-weight: 500;
    }
    .tab-panel { display: none; padding-top: 10px; }
    .tab-panel.active { display: block; }
    .file-path-readonly {
      flex: 1;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-descriptionForeground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      font-family: var(--vscode-editor-font-family);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-path-readonly.empty {
      font-style: italic;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="form">
  <h1 id="title">Snippet</h1>

  <label for="id">ID</label>
  <span class="hint">Used in // @cplib markers and deps (e.g. HLD)</span>
  <div id="idRenameHint" class="hint" style="display:none">
    Renaming the ID updates it in every other snippet's deps in manifest.json.
    // @cplib markers already in your source files are not changed.
  </div>
  <input type="text" id="id" autocomplete="off" />

  <label for="name">Display name</label>
  <input type="text" id="name" autocomplete="off" />

  <label for="description">Description</label>
  <textarea id="description"></textarea>

  <label for="category">Category</label>
  <div class="category-wrap">
    <input
      type="text"
      id="category"
      autocomplete="off"
      placeholder="Choose from existing, or type a new category to create"
    />
    <div class="category-menu" id="categoryMenu" role="listbox"></div>
  </div>

  <label>Snippet file</label>

  <div id="fileSectionAdd">
    <div class="tabbar" role="tablist">
      <button type="button" class="tab active" data-tab="existing" role="tab">Use existing file</button>
      <button type="button" class="tab" data-tab="new" role="tab">Create new file</button>
    </div>
    <div id="panelExisting" class="tab-panel active" role="tabpanel">
      <span class="hint">Pick a .h file that already exists in your library folder.</span>
      <div class="file-row" style="margin-top: 8px">
        <div id="fileExistingDisplay" class="file-path-readonly empty">No file selected</div>
        <input type="hidden" id="fileExisting" value="" />
        <button type="button" class="secondary" id="pickExisting">Pick file…</button>
      </div>
    </div>
    <div id="panelNew" class="tab-panel" role="tabpanel">
      <span class="hint">Set the path and paste the snippet code — the file will be created on save.</span>
      <div class="file-row" style="margin-top: 8px">
        <input type="text" id="fileNew" autocomplete="off" placeholder="e.g. graph/HLD.h" />
        <button type="button" class="secondary" id="choosePath">Choose path…</button>
      </div>
      <textarea id="codeNew" class="code-box" spellcheck="false" placeholder="Paste snippet code here…"></textarea>
    </div>
  </div>

  <div id="fileSectionEdit" style="display:none">
    <span class="hint">Update the file path and/or snippet code.</span>
    <div class="file-row" style="margin-top: 8px">
      <input type="text" id="fileEdit" autocomplete="off" />
      <button type="button" class="secondary" id="choosePathEdit">Choose path…</button>
    </div>
    <textarea id="codeEdit" class="code-box" spellcheck="false"></textarea>
  </div>

  <label>Dependencies</label>
  <span class="hint">Snippets imported automatically before this one</span>
  <div class="deps" id="deps"></div>

  <div class="error" id="error"></div>

  <div class="actions">
    <button type="button" class="primary" id="save">Save</button>
    <button type="button" class="secondary" id="cancel">Cancel</button>
    <div class="danger-actions" id="dangerActions" style="display:none">
      <button type="button" class="danger" id="remove">Remove from library</button>
      <button type="button" class="danger" id="delete">Delete snippet</button>
    </div>
  </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let mode = "add";
    let excludeId = "";
    let activeFileTab = "existing";
    let categoryOptions = [];

    function escHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function closeCategoryMenu() {
      document.getElementById("categoryMenu").classList.remove("open");
    }

    function updateCategoryMenu() {
      const input = document.getElementById("category");
      const menu = document.getElementById("categoryMenu");
      const query = input.value.trim().toLowerCase();
      const matches = categoryOptions.filter(
        (cat) => !query || cat.toLowerCase().includes(query)
      );
      if (document.activeElement !== input || matches.length === 0) {
        closeCategoryMenu();
        menu.innerHTML = "";
        return;
      }
      menu.innerHTML = matches
        .map(
          (cat) =>
            '<button type="button" class="category-option" role="option" data-value="' +
            escHtml(cat) +
            '">' +
            escHtml(cat) +
            "</button>"
        )
        .join("");
      menu.classList.add("open");
    }

    function showError(msg) {
      const el = document.getElementById("error");
      el.textContent = msg;
      el.classList.add("visible");
    }
    function clearError() {
      const el = document.getElementById("error");
      el.classList.remove("visible");
    }

    function renderDeps(options, selected) {
      const container = document.getElementById("deps");
      container.innerHTML = "";
      const filtered = options.filter((o) => o.id !== excludeId);
      if (!filtered.length) {
        container.innerHTML = '<div class="empty-deps">No other snippets yet.</div>';
        return;
      }
      for (const opt of filtered) {
        const row = document.createElement("div");
        row.className = "dep-item";
        const checked = selected.includes(opt.id) ? "checked" : "";
        row.innerHTML =
          '<input type="checkbox" id="dep-' + opt.id + '" value="' + opt.id + '" ' + checked + ' />' +
          '<label for="dep-' + opt.id + '">' +
          '<div class="dep-id">' + opt.id + '</div>' +
          '<div class="dep-desc">' + (opt.name || "") + (opt.description ? " — " + opt.description : "") + '</div>' +
          '</label>';
        container.appendChild(row);
      }
    }

    function getSelectedDeps() {
      return [...document.querySelectorAll('#deps input[type="checkbox"]:checked')].map((el) => el.value);
    }

    function setFileTab(tab) {
      activeFileTab = tab;
      document.querySelectorAll(".tab").forEach((el) => {
        el.classList.toggle("active", el.dataset.tab === tab);
      });
      document.getElementById("panelExisting").classList.toggle("active", tab === "existing");
      document.getElementById("panelNew").classList.toggle("active", tab === "new");
    }

    function setExistingFileDisplay(path) {
      const display = document.getElementById("fileExistingDisplay");
      const hidden = document.getElementById("fileExisting");
      hidden.value = path;
      if (path) {
        display.textContent = path;
        display.classList.remove("empty");
      } else {
        display.textContent = "No file selected";
        display.classList.add("empty");
      }
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (msg.type === "init") {
        const d = msg.data;
        mode = d.mode;
        excludeId = d.excludeId || (d.meta && d.meta.id) || "";

        document.getElementById("title").textContent =
          mode === "add" ? "Add Snippet" : "Edit: " + d.meta.id;

        const idEl = document.getElementById("id");
        idEl.value = d.meta ? d.meta.id : "";
        idEl.disabled = false;
        document.getElementById("idRenameHint").style.display =
          mode === "edit" ? "block" : "none";

        document.getElementById("name").value = d.meta ? d.meta.name : "";
        document.getElementById("description").value = d.meta ? d.meta.description : "";
        document.getElementById("category").value = d.meta ? d.meta.category : "";

        const isEdit = mode === "edit";
        document.getElementById("fileSectionAdd").style.display = isEdit ? "none" : "block";
        document.getElementById("fileSectionEdit").style.display = isEdit ? "block" : "none";

        if (isEdit && d.meta) {
          document.getElementById("fileEdit").value = d.meta.file;
          document.getElementById("codeEdit").value = d.initialCode || "";
        } else {
          setExistingFileDisplay("");
          document.getElementById("fileNew").value = "";
          document.getElementById("codeNew").value = "";
          setFileTab("existing");
        }

        categoryOptions = d.categories;
        closeCategoryMenu();

        renderDeps(d.depOptions, d.meta ? d.meta.deps : []);

        document.getElementById("dangerActions").style.display =
          mode === "edit" ? "flex" : "none";
      }
      if (msg.type === "filePicked") {
        if (msg.target === "existing") {
          setExistingFileDisplay(msg.file);
          setFileTab("existing");
        } else if (msg.target === "edit") {
          document.getElementById("fileEdit").value = msg.file;
        } else {
          document.getElementById("fileNew").value = msg.file;
          document.getElementById("fileNew").dataset.auto = "0";
          setFileTab("new");
        }
      }
      if (msg.type === "error") {
        showError(msg.message);
      }
    });

    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => setFileTab(btn.dataset.tab));
    });

    document.getElementById("pickExisting").addEventListener("click", () => {
      vscode.postMessage({ type: "browseExisting" });
    });

    document.getElementById("choosePath").addEventListener("click", () => {
      vscode.postMessage({
        type: "choosePath",
        file: document.getElementById("fileNew").value,
        id: document.getElementById("id").value,
      });
    });

    document.getElementById("choosePathEdit").addEventListener("click", () => {
      vscode.postMessage({
        type: "choosePath",
        file: document.getElementById("fileEdit").value,
        id: document.getElementById("id").value,
        target: "edit",
      });
    });

    document.getElementById("id").addEventListener("input", (e) => {
      if (mode !== "add" || activeFileTab !== "new") return;
      const fileEl = document.getElementById("fileNew");
      if (!fileEl.value || fileEl.dataset.auto === "1") {
        fileEl.value = e.target.value ? e.target.value + ".h" : "";
        fileEl.dataset.auto = "1";
      }
    });
    document.getElementById("fileNew").addEventListener("input", () => {
      document.getElementById("fileNew").dataset.auto = "0";
    });

    const categoryInput = document.getElementById("category");
    const categoryMenu = document.getElementById("categoryMenu");
    categoryInput.addEventListener("focus", updateCategoryMenu);
    categoryInput.addEventListener("input", updateCategoryMenu);
    categoryInput.addEventListener("blur", () => {
      setTimeout(closeCategoryMenu, 120);
    });
    categoryMenu.addEventListener("mousedown", (e) => {
      const option = e.target.closest(".category-option");
      if (!option) {
        return;
      }
      e.preventDefault();
      categoryInput.value = option.dataset.value;
      closeCategoryMenu();
    });

    document.getElementById("save").addEventListener("click", () => {
      clearError();
      let file = "";
      let pastedCode;
      let fileMode;

      if (mode === "edit") {
        file = document.getElementById("fileEdit").value;
        pastedCode = document.getElementById("codeEdit").value || undefined;
      } else if (activeFileTab === "existing") {
        fileMode = "existing";
        file = document.getElementById("fileExisting").value;
      } else {
        fileMode = "new";
        file = document.getElementById("fileNew").value;
        pastedCode = document.getElementById("codeNew").value || undefined;
      }

      vscode.postMessage({
        type: "save",
        data: {
          id: document.getElementById("id").value,
          name: document.getElementById("name").value,
          description: document.getElementById("description").value,
          category: document.getElementById("category").value,
          file,
          deps: getSelectedDeps(),
          pastedCode,
          fileMode,
        },
      });
    });

    document.getElementById("cancel").addEventListener("click", () => {
      vscode.postMessage({ type: "cancel" });
    });

    document.getElementById("remove").addEventListener("click", () => {
      vscode.postMessage({ type: "remove" });
    });

    document.getElementById("delete").addEventListener("click", () => {
      vscode.postMessage({ type: "delete" });
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

export function buildFormInit(
  library: Library,
  mode: "add" | "edit",
  meta?: SnippetMeta
): FormInit {
  return {
    mode,
    meta,
    categories: library.getCategories(),
    depOptions: library.getAll().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
    excludeId: meta?.id,
  };
}
